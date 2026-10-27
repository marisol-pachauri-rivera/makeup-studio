import { and, asc, eq, gt, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { horarioTrabajo, maquilladora } from "@/db/schema";
import type { DatosHorario } from "./esquemas";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type Horario = typeof horarioTrabajo.$inferSelect;

export type ResultadoAltaHorario =
  | { estado: "creado"; horario: Horario }
  | { estado: "solapado" }
  | { estado: "maquilladora_inexistente" };

/** Tramos de la maquilladora ordenados por día (0 = domingo) y hora de inicio. */
export function listarHorarios(db: Db, maquilladoraId: number): Promise<Horario[]> {
  return db
    .select()
    .from(horarioTrabajo)
    .where(eq(horarioTrabajo.maquilladoraId, maquilladoraId))
    .orderBy(asc(horarioTrabajo.diaSemana), asc(horarioTrabajo.horaInicio), asc(horarioTrabajo.id));
}

/**
 * Agrega un tramo si no se solapa con otro de la misma maquilladora y día (contiguos sí valen).
 * La base no tiene restricción para esto, así que se comprueba y se inserta en una transacción que
 * bloquea la fila de la maquilladora: dos altas simultáneas para ella se ejecutan una detrás de otra.
 */
export function agregarHorario(db: Db, maquilladoraId: number, datos: DatosHorario): Promise<ResultadoAltaHorario> {
  return db.transaction(async (tx) => {
    const [existe] = await tx
      .select({ id: maquilladora.id })
      .from(maquilladora)
      .where(eq(maquilladora.id, maquilladoraId))
      .for("update");
    if (!existe) return { estado: "maquilladora_inexistente" } as const;

    const [choque] = await tx
      .select({ id: horarioTrabajo.id })
      .from(horarioTrabajo)
      .where(
        and(
          eq(horarioTrabajo.maquilladoraId, maquilladoraId),
          eq(horarioTrabajo.diaSemana, datos.diaSemana),
          lt(horarioTrabajo.horaInicio, datos.horaFin),
          gt(horarioTrabajo.horaFin, datos.horaInicio),
        ),
      )
      .limit(1);
    if (choque) return { estado: "solapado" } as const;

    const [horario] = await tx
      .insert(horarioTrabajo)
      .values({
        maquilladoraId,
        diaSemana: datos.diaSemana,
        horaInicio: datos.horaInicio,
        horaFin: datos.horaFin,
      })
      .returning();
    return { estado: "creado", horario } as const;
  });
}

/**
 * Borra el tramo solo si pertenece a esa maquilladora. Devuelve `false` si no había nada que borrar
 * (ya quitado, inexistente o de otra maquilladora): repetirlo no falla.
 */
export async function quitarHorario(db: Db, maquilladoraId: number, id: number): Promise<boolean> {
  const borrados = await db
    .delete(horarioTrabajo)
    .where(and(eq(horarioTrabajo.id, id), eq(horarioTrabajo.maquilladoraId, maquilladoraId)))
    .returning({ id: horarioTrabajo.id });
  return borrados.length > 0;
}
