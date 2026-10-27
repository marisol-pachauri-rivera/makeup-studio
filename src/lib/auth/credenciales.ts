import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import { usuarioAdmin } from "@/db/schema";
import { borrarFallos, consultarLimite, normalizarUsuario, registrarFallo } from "./limite-intentos";
import { verificarOSimular } from "./password";

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export const loginSchema = z.object({
  usuario: z.string("Ingresá tu usuario.").trim().min(1, "Ingresá tu usuario.").max(100, "El usuario es demasiado largo."),
  password: z
    .string("Ingresá tu contraseña.")
    .min(1, "Ingresá tu contraseña.")
    .max(200, "La contraseña es demasiado larga."),
});

export type ResultadoAutorizacion =
  | { ok: true; admin: { id: string; usuario: string } }
  | { ok: false; motivo: "datos" | "invalidas" | "bloqueado" };

/**
 * Decide si las credenciales abren sesión. El límite se aplica antes de verificar la contraseña y
 * un intento bloqueado no registra otro fallo. Usuario inexistente y contraseña incorrecta dan el
 * mismo resultado (`invalidas`) y ambos cuentan como fallo.
 */
export async function autorizar(db: Db, entrada: unknown, ahora: Date = new Date()): Promise<ResultadoAutorizacion> {
  const datos = loginSchema.safeParse(entrada);
  if (!datos.success) return { ok: false, motivo: "datos" };

  const usuario = normalizarUsuario(datos.data.usuario);

  if ((await consultarLimite(db, usuario, ahora)).bloqueado) return { ok: false, motivo: "bloqueado" };

  const [fila] = await db
    .select({ id: usuarioAdmin.id, usuario: usuarioAdmin.usuario, passwordHash: usuarioAdmin.passwordHash })
    .from(usuarioAdmin)
    .where(eq(sql`lower(${usuarioAdmin.usuario})`, usuario))
    .limit(1);

  const coincide = await verificarOSimular(datos.data.password, fila?.passwordHash);
  if (!coincide || !fila) {
    await registrarFallo(db, usuario, ahora);
    return { ok: false, motivo: "invalidas" };
  }

  await borrarFallos(db, usuario);
  return { ok: true, admin: { id: String(fila.id), usuario: fila.usuario } };
}
