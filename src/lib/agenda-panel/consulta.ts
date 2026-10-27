import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { bloqueoAgenda, horarioTrabajo, reserva, reservaLinea, servicio } from "@/db/schema";
import { listarMaquilladoras, type Maquilladora } from "@/lib/catalogo/maquilladoras";
import { diaDeLaSemana } from "@/lib/disponibilidad/fechas";
import { condicionVencida } from "@/lib/reserva/vencimiento";
import { limitesDelDia } from "./rango";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type TramoDelDia = { horaInicio: string; horaFin: string };

export type TurnoDelDia = {
  lineaId: number;
  maquilladoraId: number;
  persona: string;
  servicio: string;
  inicio: Date;
  fin: Date;
  estadoReserva: (typeof reserva.$inferSelect)["estado"];
  /** Devuelta a `pendiente_pago` por un rechazo del pago: no vence. */
  motivoRechazo: string | null;
  /** Con la misma definición que la disponibilidad pública: la agenda y la oferta nunca discrepan. */
  vencida: boolean;
  nombreContacto: string;
  telefonoContacto: string;
};

export type BloqueoDelDia = { id: number; maquilladoraId: number; inicio: Date; fin: Date; motivo: string };

export type AgendaDelDia = {
  fecha: string;
  maquilladoras: Maquilladora[];
  /** Tramos de trabajo del día de la semana de `fecha`, por id de maquilladora. */
  tramos: Map<number, TramoDelDia[]>;
  bloqueos: BloqueoDelDia[];
  turnos: TurnoDelDia[];
};

/**
 * Lo que la administradora ve de un día: horario, bloqueos y turnos ACTIVOS de cada maquilladora, en el
 * día de Lima de `fecha` (`YYYY-MM-DD`). Un turno o bloqueo que se solapa con ese día cuenta, también si
 * cruza la medianoche. Son solo lecturas con la base inyectada y sin transacción; no cambia nada, ni
 * siquiera cancela las reservas vencidas que muestra (se marcan con `vencida`, igual que
 * `liberarVencidasEnConflicto`). Incluye todas las maquilladoras: quien arma la vista decide cuáles
 * mostrar.
 */
export async function obtenerAgendaDelDia(db: Db, fecha: string, ahora: Date): Promise<AgendaDelDia> {
  const { inicio, fin } = limitesDelDia(fecha);

  const [maquilladoras, horarios, bloqueos, turnos] = await Promise.all([
    listarMaquilladoras(db),
    db
      .select({
        maquilladoraId: horarioTrabajo.maquilladoraId,
        horaInicio: horarioTrabajo.horaInicio,
        horaFin: horarioTrabajo.horaFin,
      })
      .from(horarioTrabajo)
      .where(eq(horarioTrabajo.diaSemana, diaDeLaSemana(fecha)))
      .orderBy(asc(horarioTrabajo.horaInicio), asc(horarioTrabajo.id)),
    db
      .select({
        id: bloqueoAgenda.id,
        maquilladoraId: bloqueoAgenda.maquilladoraId,
        inicio: bloqueoAgenda.inicio,
        fin: bloqueoAgenda.fin,
        motivo: bloqueoAgenda.motivo,
      })
      .from(bloqueoAgenda)
      .where(and(gt(bloqueoAgenda.fin, inicio), lt(bloqueoAgenda.inicio, fin)))
      .orderBy(asc(bloqueoAgenda.inicio), asc(bloqueoAgenda.id)),
    db
      .select({
        lineaId: reservaLinea.id,
        maquilladoraId: reservaLinea.maquilladoraId,
        persona: reservaLinea.persona,
        servicio: servicio.nombre,
        inicio: reservaLinea.inicio,
        fin: reservaLinea.fin,
        estadoReserva: reserva.estado,
        motivoRechazo: reserva.motivoRechazo,
        vencida: sql<boolean>`${condicionVencida(ahora)}`,
        nombreContacto: reserva.nombreContacto,
        telefonoContacto: reserva.telefonoContacto,
      })
      .from(reservaLinea)
      .innerJoin(reserva, eq(reserva.id, reservaLinea.reservaId))
      .innerJoin(servicio, eq(servicio.id, reservaLinea.servicioId))
      .where(and(eq(reservaLinea.activa, true), gt(reservaLinea.fin, inicio), lt(reservaLinea.inicio, fin)))
      .orderBy(asc(reservaLinea.inicio), asc(reservaLinea.id)),
  ]);

  const tramos = new Map<number, TramoDelDia[]>();
  for (const { maquilladoraId, horaInicio, horaFin } of horarios) {
    tramos.set(maquilladoraId, [...(tramos.get(maquilladoraId) ?? []), { horaInicio, horaFin }]);
  }

  return { fecha, maquilladoras, tramos, bloqueos, turnos };
}
