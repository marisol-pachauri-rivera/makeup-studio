import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { bloqueoAgenda, maquilladora } from "@/db/schema";
import type { DatosBloqueo } from "./esquemas";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type Bloqueo = typeof bloqueoAgenda.$inferSelect;
export type BloqueoListado = Bloqueo & { pasado: boolean };

/**
 * Bloqueos de la maquilladora: primero los que aún no terminaron (por inicio ascendente) y después
 * los ya terminados (el más reciente primero), cada uno con la marca `pasado` (`fin <= ahora`).
 */
export async function listarBloqueos(db: Db, maquilladoraId: number, ahora: Date = new Date()): Promise<BloqueoListado[]> {
  const filas = await db
    .select()
    .from(bloqueoAgenda)
    .where(eq(bloqueoAgenda.maquilladoraId, maquilladoraId))
    .orderBy(asc(bloqueoAgenda.inicio), asc(bloqueoAgenda.id));

  const conMarca = filas.map((b) => ({ ...b, pasado: b.fin.getTime() <= ahora.getTime() }));
  return [...conMarca.filter((b) => !b.pasado), ...conMarca.filter((b) => b.pasado).reverse()];
}

/**
 * Guarda el bloqueo. No lo contrasta con horarios, otros bloqueos ni reservas: la agenda del panel
 * (#14) y las reservas (#11) son quienes muestran lo que ya estaba tomado. `undefined` si la
 * maquilladora no existe.
 */
export async function agregarBloqueo(db: Db, maquilladoraId: number, datos: DatosBloqueo): Promise<Bloqueo | undefined> {
  const [existe] = await db.select({ id: maquilladora.id }).from(maquilladora).where(eq(maquilladora.id, maquilladoraId));
  if (!existe) return undefined;

  const [bloqueo] = await db
    .insert(bloqueoAgenda)
    .values({ maquilladoraId, inicio: datos.inicio, fin: datos.fin, motivo: datos.motivo })
    .returning();
  return bloqueo;
}

/**
 * Borra el bloqueo solo si pertenece a esa maquilladora. Devuelve `false` si no había nada que borrar
 * (ya quitado, inexistente o de otra maquilladora): repetirlo no falla.
 */
export async function quitarBloqueo(db: Db, maquilladoraId: number, id: number): Promise<boolean> {
  const borrados = await db
    .delete(bloqueoAgenda)
    .where(and(eq(bloqueoAgenda.id, id), eq(bloqueoAgenda.maquilladoraId, maquilladoraId)))
    .returning({ id: bloqueoAgenda.id });
  return borrados.length > 0;
}
