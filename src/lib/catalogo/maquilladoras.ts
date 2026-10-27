import { asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { maquilladora } from "@/db/schema";
import type { DatosMaquilladora } from "./esquemas";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type Maquilladora = typeof maquilladora.$inferSelect;

/** Todas las maquilladoras, las activas primero. El panel muestra también las inactivas. */
export function listarMaquilladoras(db: Db): Promise<Maquilladora[]> {
  return db.select().from(maquilladora).orderBy(desc(maquilladora.activa), asc(maquilladora.nombre), asc(maquilladora.id));
}

export async function obtenerMaquilladora(db: Db, id: number): Promise<Maquilladora | undefined> {
  const [fila] = await db.select().from(maquilladora).where(eq(maquilladora.id, id));
  return fila;
}

/** La maquilladora nueva queda activa (valor por defecto de la tabla). */
export async function crearMaquilladora(db: Db, datos: DatosMaquilladora): Promise<Maquilladora> {
  const [fila] = await db.insert(maquilladora).values({ nombre: datos.nombre }).returning();
  return fila;
}

/** Devuelve `undefined` si no existe. Solo cambia el nombre: horarios, bloqueos y reservas siguen ligados por id. */
export async function actualizarMaquilladora(
  db: Db,
  id: number,
  datos: DatosMaquilladora,
): Promise<Maquilladora | undefined> {
  const [fila] = await db.update(maquilladora).set({ nombre: datos.nombre }).where(eq(maquilladora.id, id)).returning();
  return fila;
}

/** Fija el estado destino (no alterna), así que repetirlo es inofensivo. `undefined` si no existe. */
export async function cambiarActivaMaquilladora(db: Db, id: number, activa: boolean): Promise<Maquilladora | undefined> {
  const [fila] = await db.update(maquilladora).set({ activa }).where(eq(maquilladora.id, id)).returning();
  return fila;
}
