import { asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { servicio } from "@/db/schema";
import type { DatosServicio } from "./esquemas";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type Servicio = typeof servicio.$inferSelect;

const valores = (datos: DatosServicio) => ({
  nombre: datos.nombre,
  descripcion: datos.descripcion,
  precio: datos.precio,
  duracionMinutos: datos.duracionMinutos,
});

/** Todos los servicios, los activos primero. El panel muestra también los inactivos. */
export function listarServicios(db: Db): Promise<Servicio[]> {
  return db.select().from(servicio).orderBy(desc(servicio.activo), asc(servicio.nombre), asc(servicio.id));
}

export async function obtenerServicio(db: Db, id: number): Promise<Servicio | undefined> {
  const [fila] = await db.select().from(servicio).where(eq(servicio.id, id));
  return fila;
}

/** El servicio nuevo queda activo (valor por defecto de la tabla). */
export async function crearServicio(db: Db, datos: DatosServicio): Promise<Servicio> {
  const [fila] = await db.insert(servicio).values(valores(datos)).returning();
  return fila;
}

/** Devuelve `undefined` si el servicio no existe. No toca `activo` ni las reservas existentes. */
export async function actualizarServicio(db: Db, id: number, datos: DatosServicio): Promise<Servicio | undefined> {
  const [fila] = await db.update(servicio).set(valores(datos)).where(eq(servicio.id, id)).returning();
  return fila;
}

/** Fija el estado destino (no alterna), así que repetirlo es inofensivo. `undefined` si no existe. */
export async function cambiarActivoServicio(db: Db, id: number, activo: boolean): Promise<Servicio | undefined> {
  const [fila] = await db.update(servicio).set({ activo }).where(eq(servicio.id, id)).returning();
  return fila;
}
