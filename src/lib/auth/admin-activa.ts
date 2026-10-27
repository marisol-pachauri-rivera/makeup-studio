import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { usuarioAdmin } from "@/db/schema";

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type SesionLeida = { user?: { id?: string | null } | null } | null | undefined;

/**
 * Devuelve la administradora de la sesión solo si sigue existiendo en `usuario_admin`: dar de baja
 * a una persona corta su acceso sin esperar a que expire la cookie (JWT sin estado).
 */
export async function buscarAdminDeSesion(db: Db, sesion: SesionLeida): Promise<{ id: number; usuario: string } | null> {
  const texto = sesion?.user?.id;
  if (!texto || !/^\d+$/.test(texto)) return null;

  const [fila] = await db
    .select({ id: usuarioAdmin.id, usuario: usuarioAdmin.usuario })
    .from(usuarioAdmin)
    .where(eq(usuarioAdmin.id, Number(texto)))
    .limit(1);
  return fila ?? null;
}
