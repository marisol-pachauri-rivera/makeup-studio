import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva, reservaLinea } from "@/db/schema";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { obtenerMaquilladoraActiva } from "@/lib/publico/catalogo";
import { esChoqueDeHorario } from "@/lib/reserva/errores-pg";
import { HorarioOcupado } from "@/lib/reserva/vencimiento";
import { actualizarLineaLiberandoVencidas } from "./actualizar-linea";
import { puedeReprogramarse } from "./plazo";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type SolicitudReprogramacion = {
  /** El token del enlace: la única credencial. */
  token: string;
  /** Id de `reserva_linea` del turno que se mueve; debe pertenecer a la reserva del token. */
  lineaId: number;
  /** Nueva maquilladora (cualquiera activa) y nuevo inicio. */
  maquilladoraId: number;
  inicio: Date;
  /** Horario y maquilladora que la clienta vio del turno: la operación solo aplica si siguen así. */
  inicioVisto: Date;
  maquilladoraVistaId: number;
};

export type ResultadoReprogramacion =
  /** `repetida`: el turno ya estaba en el destino (doble clic) y no cambió nada. */
  | { estado: "reprogramada"; repetida: boolean }
  /** Otra clienta lo tomó, o nunca se ofreció (pasado, ocupado, bloqueado, fuera de horario o de grilla). */
  | { estado: "horario_no_disponible" }
  /** Faltan menos de 24 horas para el turno original. */
  | { estado: "fuera_de_plazo" }
  /** La reserva no está confirmada, o el turno ya no está activo. */
  | { estado: "no_reprogramable" }
  /** El turno ya no está donde la clienta lo vio (otra pestaña lo movió): debe recargar. */
  | { estado: "turno_cambiado" }
  /** Ningún turno de la reserva de ese token tiene ese id. */
  | { estado: "no_encontrada" }
  /** La maquilladora elegida no existe o fue desactivada. */
  | { estado: "maquilladora_no_disponible" };

/** Se lanza dentro de la transacción cuando la reserva dejó de estar `confirmada` en el último instante. */
class NoReprogramable extends Error {}

/**
 * Mueve un turno (inicio, fin y maquilladora de su línea) de una reserva `confirmada`, sin tocar estado,
 * número de operación, monto ni precio. Es de una sola integrante a la vez: la reserva grupal conserva su
 * token, estado y monto (design, decisión 1). El fin es el nuevo inicio más la duración ORIGINAL del turno,
 * no la del servicio actual.
 *
 * - Antes de la transacción, en lecturas: pertenencia al token, estado, idempotencia, pantalla
 *   desactualizada, plazo (sobre el turno ORIGINAL, con el reloj inyectado), maquilladora activa y
 *   revalidación con la disponibilidad pública sin contar el propio turno. Un cliente de transacción no
 *   admite consultas en paralelo, y la exclusión de Postgres sigue siendo la garantía final.
 * - Dentro: `SELECT … FOR UPDATE` de la reserva `confirmada`, que la serializa contra una cancelación o
 *   cualquier transición (hacen `UPDATE` sobre esa fila y después desactivan líneas: mismo orden de
 *   bloqueos), y `actualizarLineaLiberandoVencidas`. Si algo vigente ocupa el destino se deshace todo y el
 *   turno original queda intacto.
 * - `23P01` y `40P01` (el perdedor de una carrera puede recibir cualquiera) son "horario no disponible".
 */
export async function reprogramarTurno(
  db: Db,
  solicitud: SolicitudReprogramacion,
  ahora: Date,
): Promise<ResultadoReprogramacion> {
  const turno = await leerTurno(db, solicitud);
  if (!turno) return { estado: "no_encontrada" };
  if (turno.estadoReserva !== "confirmada" || !turno.activa) return { estado: "no_reprogramable" };

  const yaEnDestino = () =>
    turno.maquilladoraId === solicitud.maquilladoraId && turno.inicio.getTime() === solicitud.inicio.getTime();
  // Doble clic: el primer envío ya lo movió. Se responde éxito, sin otro cambio ni revalidar el plazo.
  if (yaEnDestino()) return { estado: "reprogramada", repetida: true };
  if (
    turno.maquilladoraId !== solicitud.maquilladoraVistaId ||
    turno.inicio.getTime() !== solicitud.inicioVisto.getTime()
  ) {
    return { estado: "turno_cambiado" };
  }
  if (!puedeReprogramarse(turno.inicio, ahora)) return { estado: "fuera_de_plazo" };

  const maquilladora = await obtenerMaquilladoraActiva(db, solicitud.maquilladoraId);
  if (!maquilladora) return { estado: "maquilladora_no_disponible" };

  const duracionMs = turno.fin.getTime() - turno.inicio.getTime();
  const dias = await consultarDisponibilidad(db, {
    servicio: { duracionMinutos: duracionMs / 60_000 },
    maquilladoraId: maquilladora.id,
    ahora,
    ignorarLineaId: turno.id,
  });
  if (!dias.some((d) => d.inicios.some((i) => i.getTime() === solicitud.inicio.getTime()))) {
    return { estado: "horario_no_disponible" };
  }

  const destino = {
    maquilladoraId: maquilladora.id,
    inicio: solicitud.inicio,
    fin: new Date(solicitud.inicio.getTime() + duracionMs),
  };

  try {
    return await db.transaction(async (tx): Promise<ResultadoReprogramacion> => {
      const [bloqueada] = await tx
        .select({ id: reserva.id })
        .from(reserva)
        .where(and(eq(reserva.id, turno.reservaId), eq(reserva.estado, "confirmada")))
        .for("update");
      if (!bloqueada) throw new NoReprogramable();

      const resultado = await actualizarLineaLiberandoVencidas(
        tx,
        { lineaId: turno.id, inicioVisto: solicitud.inicioVisto, maquilladoraVistaId: solicitud.maquilladoraVistaId, destino },
        ahora,
      );
      // Algo vigente sigue ocupando: se deshace todo, también las vencidas ya canceladas.
      if (resultado === "ocupado") throw new HorarioOcupado();
      if (resultado === "turno_cambiado") return { estado: "turno_cambiado" };
      return { estado: "reprogramada", repetida: resultado === "repetida" };
    });
  } catch (error) {
    if (error instanceof NoReprogramable) return { estado: "no_reprogramable" };
    if (error instanceof HorarioOcupado || esChoqueDeHorario(error)) return { estado: "horario_no_disponible" };
    throw error;
  }
}

/** El turno con el estado de su reserva, solo si pertenece a la reserva del token. */
async function leerTurno(db: Db, { token, lineaId }: Pick<SolicitudReprogramacion, "token" | "lineaId">) {
  const [fila] = await db
    .select({
      id: reservaLinea.id,
      reservaId: reserva.id,
      estadoReserva: reserva.estado,
      activa: reservaLinea.activa,
      inicio: reservaLinea.inicio,
      fin: reservaLinea.fin,
      maquilladoraId: reservaLinea.maquilladoraId,
    })
    .from(reservaLinea)
    .innerJoin(reserva, eq(reserva.id, reservaLinea.reservaId))
    .where(and(eq(reservaLinea.id, lineaId), eq(reserva.token, token)));
  return fila;
}
