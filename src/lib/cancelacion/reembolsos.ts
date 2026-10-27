import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva } from "@/db/schema";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type ReembolsoPendiente = {
  id: number;
  montoTotal: string;
  /** Con el que la clienta informó el pago: el studio lo busca en su billetera. Puede faltar (ver design, pregunta 2). */
  numeroOperacion: string | null;
  nombreContacto: string;
  telefonoContacto: string;
  creadaEn: Date;
};

/** Reservas con reembolso `pendiente`, de la más antigua a la más reciente; el identificador desempata. */
export function listarReembolsosPendientes(db: Db): Promise<ReembolsoPendiente[]> {
  return db
    .select({
      id: reserva.id,
      montoTotal: reserva.montoTotal,
      numeroOperacion: reserva.numeroOperacion,
      nombreContacto: reserva.nombreContacto,
      telefonoContacto: reserva.telefonoContacto,
      creadaEn: reserva.creadaEn,
    })
    .from(reserva)
    .where(eq(reserva.estadoReembolso, "pendiente"))
    .orderBy(asc(reserva.creadaEn), asc(reserva.id));
}

export type ResultadoMarcado =
  /** El reembolso pasó de `pendiente` a `realizado` con esta llamada. */
  | { estado: "realizado" }
  /** Ya estaba `realizado` (doble clic): no es un error. */
  | { estado: "ya_realizado" }
  /** La reserva no tiene reembolso que hacer: no se marca. */
  | { estado: "no_aplica" }
  /** Ninguna reserva tiene ese identificador. */
  | { estado: "no_encontrada" };

/**
 * Marca un reembolso como realizado. Es UN `UPDATE` condicionado a que siga `pendiente`: dos marcados
 * simultáneos dejan uno `realizado` y el otro `ya_realizado`. Si no afecta filas, una lectura explica por
 * qué (ya realizado, no aplica o inexistente). No guarda quién ni cuándo: no hay columna para eso.
 */
export async function marcarReembolsoRealizado(db: Db, id: number): Promise<ResultadoMarcado> {
  const [fila] = await db
    .update(reserva)
    .set({ estadoReembolso: "realizado" })
    .where(and(eq(reserva.id, id), eq(reserva.estadoReembolso, "pendiente")))
    .returning({ id: reserva.id });
  if (fila) return { estado: "realizado" };

  const [actual] = await db.select({ estadoReembolso: reserva.estadoReembolso }).from(reserva).where(eq(reserva.id, id));
  if (!actual) return { estado: "no_encontrada" };
  // Otro marcado terminó entre el UPDATE y la lectura, o la reserva nunca tuvo reembolso.
  return { estado: actual.estadoReembolso === "no_aplica" ? "no_aplica" : "ya_realizado" };
}
