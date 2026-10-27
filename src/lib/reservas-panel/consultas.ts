import { asc, count, desc, eq, min, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { maquilladora, reserva, reservaLinea, servicio } from "@/db/schema";
import { condicionVencida } from "@/lib/reserva/vencimiento";
import { RESERVAS_POR_PAGINA, type FiltroDeEstado } from "./esquemas";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type FilaDeReserva = {
  id: number;
  estado: (typeof reserva.$inferSelect)["estado"];
  nombreContacto: string;
  telefonoContacto: string;
  numeroOperacion: string | null;
  montoTotal: string;
  estadoReembolso: (typeof reserva.$inferSelect)["estadoReembolso"];
  creadaEn: Date;
  /** `min(inicio)` de sus líneas: lo que la administradora usa para ubicar la reserva. */
  primerTurno: Date;
  personas: number;
  /** En `pendiente_pago` porque el studio rechazó el pago: no vence, espera un número nuevo. */
  esperandoNuevoNumero: boolean;
  /** En `pendiente_pago` sin número ni rechazo y con el plazo de 20 minutos pasado. Solo se lee, no se cancela. */
  plazoVencido: boolean;
};

export type PaginaDeReservas = {
  filas: FilaDeReserva[];
  total: number;
  pagina: number;
  hayMas: boolean;
};

/**
 * Pendientes de validación primero, de la más antigua a la más reciente (son las que esperan a la
 * administradora); después las demás de la más reciente a la más antigua. El identificador desempata
 * para que el orden sea estable entre páginas.
 */
const ORDEN_DE_LA_LISTA = [
  sql`(${reserva.estado} <> 'pendiente_validacion')`,
  sql`case when ${reserva.estado} = 'pendiente_validacion' then ${reserva.creadaEn} end asc`,
  desc(reserva.creadaEn),
  desc(reserva.id),
];

/**
 * Una página de la lista del panel. `ahora` sirve solo para marcar el plazo vencido con la misma
 * definición que usa el vencimiento (`condicionVencida`); esta lectura nunca cambia el estado de una
 * reserva. Las dos consultas van en serie: la lista puede correr sobre un cliente de transacción.
 */
export async function listarReservas(
  db: Db,
  { pagina, estado, ahora }: { pagina: number; estado?: FiltroDeEstado; ahora: Date },
): Promise<PaginaDeReservas> {
  const filtro = estado ? eq(reserva.estado, estado) : undefined;

  const filas = await db
    .select({
      id: reserva.id,
      estado: reserva.estado,
      nombreContacto: reserva.nombreContacto,
      telefonoContacto: reserva.telefonoContacto,
      numeroOperacion: reserva.numeroOperacion,
      montoTotal: reserva.montoTotal,
      estadoReembolso: reserva.estadoReembolso,
      creadaEn: reserva.creadaEn,
      motivoRechazo: reserva.motivoRechazo,
      primerTurno: min(reservaLinea.inicio),
      personas: count(reservaLinea.id),
      plazoVencido: sql<boolean>`${condicionVencida(ahora)}`,
    })
    .from(reserva)
    .leftJoin(reservaLinea, eq(reservaLinea.reservaId, reserva.id))
    .where(filtro)
    .groupBy(reserva.id)
    .orderBy(...ORDEN_DE_LA_LISTA)
    .limit(RESERVAS_POR_PAGINA)
    .offset((pagina - 1) * RESERVAS_POR_PAGINA);

  const [{ total }] = await db.select({ total: count() }).from(reserva).where(filtro);

  return {
    filas: filas.map(({ motivoRechazo, primerTurno, ...fila }) => ({
      ...fila,
      // Una reserva siempre tiene al menos una línea; el respaldo evita un nulo si faltara.
      primerTurno: primerTurno ?? fila.creadaEn,
      esperandoNuevoNumero: fila.estado === "pendiente_pago" && motivoRechazo !== null,
    })),
    total,
    pagina,
    hayMas: pagina * RESERVAS_POR_PAGINA < total,
  };
}

export type TurnoDeReserva = {
  persona: string;
  servicio: string;
  maquilladora: string;
  inicio: Date;
  fin: Date;
  precio: string;
  activa: boolean;
};

export type DetalleDeReserva = {
  id: number;
  estado: (typeof reserva.$inferSelect)["estado"];
  nombreContacto: string;
  telefonoContacto: string;
  numeroOperacion: string | null;
  montoTotal: string;
  estadoReembolso: (typeof reserva.$inferSelect)["estadoReembolso"];
  motivoRechazo: string | null;
  motivoCancelacion: (typeof reserva.$inferSelect)["motivoCancelacion"];
  creadaEn: Date;
  validadaEn: Date | null;
  /** Una por persona, por hora de inicio. Incluye las inactivas de una reserva cancelada. */
  turnos: TurnoDeReserva[];
};

/** El detalle de una reserva con sus turnos, o `undefined` si ningún identificador coincide. */
export async function obtenerReservaParaPanel(db: Db, id: number): Promise<DetalleDeReserva | undefined> {
  const filas = await db
    .select({
      id: reserva.id,
      estado: reserva.estado,
      nombreContacto: reserva.nombreContacto,
      telefonoContacto: reserva.telefonoContacto,
      numeroOperacion: reserva.numeroOperacion,
      montoTotal: reserva.montoTotal,
      estadoReembolso: reserva.estadoReembolso,
      motivoRechazo: reserva.motivoRechazo,
      motivoCancelacion: reserva.motivoCancelacion,
      creadaEn: reserva.creadaEn,
      validadaEn: reserva.validadaEn,
      persona: reservaLinea.persona,
      servicio: servicio.nombre,
      maquilladora: maquilladora.nombre,
      inicio: reservaLinea.inicio,
      fin: reservaLinea.fin,
      precio: reservaLinea.precio,
      activa: reservaLinea.activa,
    })
    .from(reserva)
    .innerJoin(reservaLinea, eq(reservaLinea.reservaId, reserva.id))
    .innerJoin(servicio, eq(servicio.id, reservaLinea.servicioId))
    .innerJoin(maquilladora, eq(maquilladora.id, reservaLinea.maquilladoraId))
    .where(eq(reserva.id, id))
    .orderBy(asc(reservaLinea.inicio), asc(reservaLinea.id));

  if (filas.length === 0) return undefined;
  const f = filas[0];
  return {
    id: f.id,
    estado: f.estado,
    nombreContacto: f.nombreContacto,
    telefonoContacto: f.telefonoContacto,
    numeroOperacion: f.numeroOperacion,
    montoTotal: f.montoTotal,
    estadoReembolso: f.estadoReembolso,
    motivoRechazo: f.motivoRechazo,
    motivoCancelacion: f.motivoCancelacion,
    creadaEn: f.creadaEn,
    validadaEn: f.validadaEn,
    turnos: filas.map(({ persona, servicio, maquilladora, inicio, fin, precio, activa }) => ({
      persona,
      servicio,
      maquilladora,
      inicio,
      fin,
      precio,
      activa,
    })),
  };
}
