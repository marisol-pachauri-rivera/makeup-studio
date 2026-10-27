import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { maquilladora, reserva, reservaLinea, servicio } from "@/db/schema";
import { puedeReprogramarse } from "./plazo";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type TurnoReprogramable = {
  /** Id de `reserva_linea`: la posición cambia al reprogramar, el id no. */
  id: number;
  persona: string;
  servicio: string;
  maquilladora: string;
  /** Con `inicio`, lo que la clienta "ve" del turno: la reprogramación solo aplica si sigue así. */
  maquilladoraId: number;
  inicio: Date;
  fin: Date;
  /** Faltan 24 horas o más para este turno. Solo anticipa la regla: la decide el servidor. */
  puedeReprogramar: boolean;
};

/**
 * Los turnos activos de una reserva `confirmada`, con el id que la pantalla manda al reprogramar. Vacío
 * si el token no existe o la reserva está en otro estado (la reprogramación solo vale con el pago ya
 * validado). No lee teléfono, nombre de contacto ni número de operación: el token es la única credencial.
 */
export async function obtenerTurnosReprogramables(db: Db, token: string, ahora: Date): Promise<TurnoReprogramable[]> {
  const filas = await db
    .select({
      id: reservaLinea.id,
      persona: reservaLinea.persona,
      servicio: servicio.nombre,
      maquilladora: maquilladora.nombre,
      maquilladoraId: reservaLinea.maquilladoraId,
      inicio: reservaLinea.inicio,
      fin: reservaLinea.fin,
    })
    .from(reserva)
    .innerJoin(reservaLinea, eq(reservaLinea.reservaId, reserva.id))
    .innerJoin(servicio, eq(servicio.id, reservaLinea.servicioId))
    .innerJoin(maquilladora, eq(maquilladora.id, reservaLinea.maquilladoraId))
    .where(and(eq(reserva.token, token), eq(reserva.estado, "confirmada"), eq(reservaLinea.activa, true)))
    .orderBy(asc(reservaLinea.inicio), asc(reservaLinea.id));

  return filas.map((fila) => ({ ...fila, puedeReprogramar: puedeReprogramarse(fila.inicio, ahora) }));
}
