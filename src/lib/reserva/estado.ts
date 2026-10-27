import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { maquilladora, reserva, reservaLinea, servicio } from "@/db/schema";
import { limiteDeCancelacion } from "@/lib/cancelacion/plazo";
import { PLAZO_VENCIMIENTO_MINUTOS } from "./vencimiento";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type LineaDeReserva = {
  persona: string;
  servicio: string;
  maquilladora: string;
  inicio: Date;
  fin: Date;
  precio: string;
  activa: boolean;
};

export type EstadoDeReserva = {
  estado: (typeof reserva.$inferSelect)["estado"];
  montoTotal: string;
  creadaEn: Date;
  /**
   * Hasta cuándo tiene para pagar sin riesgo de perder el horario: creación más el plazo de 20 minutos.
   * `null` si la reserva no puede vencer (no está en `pendiente_pago`, o volvió a `pendiente_pago` por
   * un rechazo del pago, ADR 0003), porque entonces no hay plazo que mostrar.
   */
  plazoPagoHasta: Date | null;
  /**
   * Por qué el studio no validó el pago, mientras la reserva espera un número nuevo (`pendiente_pago`
   * devuelta por un rechazo, ADR 0005). `null` en cualquier otro estado y si nunca hubo rechazo: el
   * texto es de la administradora y solo tiene sentido junto al campo donde la clienta lo corrige.
   */
  motivoRechazo: string | null;
  /** Si hay un pago por devolver (`pendiente`), ya devuelto (`realizado`) o no (`no_aplica`). */
  estadoReembolso: (typeof reserva.$inferSelect)["estadoReembolso"];
  /**
   * Último instante en que la clienta puede cancelar: 24 horas antes del primer turno activo. `null` si
   * la reserva no tiene turnos activos (está cancelada). Es solo para mostrar: el servidor decide.
   */
  puedeCancelarHasta: Date | null;
  /** Por qué se canceló, si está cancelada; la página explica distinto una cancelación por vencimiento. */
  motivoCancelacion: (typeof reserva.$inferSelect)["motivoCancelacion"];
  /** Una por persona; en la reserva individual, una sola. Incluye las inactivas (reserva cancelada). */
  lineas: LineaDeReserva[];
};

/**
 * Lo que la página de estado muestra de una reserva. El token es la única credencial (ADR 0004), así
 * que la lectura no selecciona teléfono, nombre de contacto, número de operación ni clave de
 * idempotencia: lo que no se lee no puede filtrarse. `undefined` si ninguna reserva tiene ese token.
 */
export async function obtenerReservaPorToken(db: Db, token: string): Promise<EstadoDeReserva | undefined> {
  const filas = await db
    .select({
      estado: reserva.estado,
      montoTotal: reserva.montoTotal,
      creadaEn: reserva.creadaEn,
      motivoRechazo: reserva.motivoRechazo,
      motivoCancelacion: reserva.motivoCancelacion,
      estadoReembolso: reserva.estadoReembolso,
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
    .where(eq(reserva.token, token))
    .orderBy(asc(reservaLinea.inicio), asc(reservaLinea.id));

  if (filas.length === 0) return undefined;
  const { estado, montoTotal, creadaEn, motivoRechazo, motivoCancelacion, estadoReembolso } = filas[0];
  // `filas` viene ordenado por inicio: la primera línea activa es el primer turno.
  const primerTurnoActivo = filas.find((f) => f.activa)?.inicio;
  const puedeVencer = estado === "pendiente_pago" && motivoRechazo === null;
  return {
    estado,
    montoTotal,
    creadaEn,
    plazoPagoHasta: puedeVencer ? new Date(creadaEn.getTime() + PLAZO_VENCIMIENTO_MINUTOS * 60_000) : null,
    motivoRechazo: estado === "pendiente_pago" ? motivoRechazo : null,
    estadoReembolso,
    puedeCancelarHasta: primerTurnoActivo ? limiteDeCancelacion(primerTurnoActivo) : null,
    motivoCancelacion,
    lineas: filas.map(({ persona, servicio, maquilladora, inicio, fin, precio, activa }) => ({
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
