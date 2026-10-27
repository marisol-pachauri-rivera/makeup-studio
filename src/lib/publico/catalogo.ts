import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { maquilladora, servicio } from "@/db/schema";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

// Lecturas del sitio público: nunca devuelven registros inactivos. Están aparte de las del panel
// (`src/lib/catalogo/`), que sí los muestran, para que un cambio en una no filtre datos en la otra.

export type ServicioPublico = typeof servicio.$inferSelect;
export type MaquilladoraPublica = typeof maquilladora.$inferSelect;

export function listarServiciosActivos(db: Db): Promise<ServicioPublico[]> {
  return db.select().from(servicio).where(eq(servicio.activo, true)).orderBy(asc(servicio.nombre), asc(servicio.id));
}

export async function obtenerServicioActivo(db: Db, id: number): Promise<ServicioPublico | undefined> {
  const [fila] = await db
    .select()
    .from(servicio)
    .where(and(eq(servicio.id, id), eq(servicio.activo, true)));
  return fila;
}

export function listarMaquilladorasActivas(db: Db): Promise<MaquilladoraPublica[]> {
  return db
    .select()
    .from(maquilladora)
    .where(eq(maquilladora.activa, true))
    .orderBy(asc(maquilladora.nombre), asc(maquilladora.id));
}

export async function obtenerMaquilladoraActiva(db: Db, id: number): Promise<MaquilladoraPublica | undefined> {
  const [fila] = await db
    .select()
    .from(maquilladora)
    .where(and(eq(maquilladora.id, id), eq(maquilladora.activa, true)));
  return fila;
}
