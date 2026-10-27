import { and, eq, gt, lt, ne, not } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { bloqueoAgenda, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { listarHorarios } from "@/lib/agenda/horarios";
import { condicionVencida } from "@/lib/reserva/vencimiento";
import { DIAS_HORIZONTE } from "./constantes";
import { hoyLocal, sumarDias } from "./fechas";
import { calcularHuecos, type DiaConHuecos, type RangoOcupado } from "./huecos";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type EntradaConsulta = {
  servicio: { duracionMinutos: number };
  maquilladoraId: number;
  ahora: Date;
  /**
   * Modo "reprogramar": esa línea es el turno que se mueve y no cuenta como ocupada, para poder
   * desplazarlo sobre su propio horario (de 10:00 a 10:30). Sin él, la consulta no cambia.
   */
  ignorarLineaId?: number;
};

/** Fin de la ventana: la medianoche local que cierra el último día ofrecido. */
function finDeVentana(ahora: Date): Date {
  const medianoche = deLocalAInstante(`${sumarDias(hoyLocal(ahora), DIAS_HORIZONTE)}T00:00`);
  return medianoche ?? new Date(ahora.getTime() + (DIAS_HORIZONTE + 1) * 24 * 60 * 60 * 1000);
}

/**
 * Días con turnos libres de una maquilladora para un servicio, en los próximos `DIAS_HORIZONTE` días.
 *
 * Ocupan agenda sus bloqueos y sus líneas de reserva activas, también las de una reserva
 * `pendiente_pago` reciente (ADR 0003). Las líneas de una reserva vencida (sin pago pasados 20
 * minutos, ver `condicionVencida`) cuentan como libres: se cancelan al chocar con ellas, pero hasta
 * entonces no deben mostrarse como ocupadas. Solo se seleccionan `inicio` y `fin`: la consulta
 * pública nunca ve nombres ni teléfonos de otras clientas.
 */
export async function consultarDisponibilidad(
  db: Db,
  { servicio, maquilladoraId, ahora, ignorarLineaId }: EntradaConsulta,
): Promise<DiaConHuecos[]> {
  const hasta = finDeVentana(ahora);

  const [tramos, bloqueos, lineas] = await Promise.all([
    listarHorarios(db, maquilladoraId),
    db
      .select({ inicio: bloqueoAgenda.inicio, fin: bloqueoAgenda.fin })
      .from(bloqueoAgenda)
      .where(
        and(
          eq(bloqueoAgenda.maquilladoraId, maquilladoraId),
          gt(bloqueoAgenda.fin, ahora),
          lt(bloqueoAgenda.inicio, hasta),
        ),
      ),
    db
      .select({ inicio: reservaLinea.inicio, fin: reservaLinea.fin })
      .from(reservaLinea)
      .innerJoin(reserva, eq(reserva.id, reservaLinea.reservaId))
      .where(
        and(
          eq(reservaLinea.maquilladoraId, maquilladoraId),
          eq(reservaLinea.activa, true),
          gt(reservaLinea.fin, ahora),
          lt(reservaLinea.inicio, hasta),
          not(condicionVencida(ahora)),
          ignorarLineaId === undefined ? undefined : ne(reservaLinea.id, ignorarLineaId),
        ),
      ),
  ]);

  const ocupados: RangoOcupado[] = [...bloqueos, ...lineas];
  return calcularHuecos({ tramos, ocupados, duracionMinutos: servicio.duracionMinutos, ahora });
}
