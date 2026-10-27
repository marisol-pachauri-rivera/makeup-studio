import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import { usuarioAdmin } from "@/db/schema";
import { normalizarUsuario } from "./limite-intentos";
import { hashearPassword } from "./password";

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export const LARGO_MINIMO_PASSWORD = 12;
/** bcrypt solo lee los primeros 72 bytes: una clave más larga daría una falsa sensación de seguridad. */
const BYTES_MAXIMOS_PASSWORD = 72;

export const altaAdminSchema = z.object({
  usuario: z.string("Falta el usuario.").trim().min(1, "Falta el usuario.").max(100, "El usuario es demasiado largo."),
  password: z
    .string("Falta la contraseña.")
    .min(LARGO_MINIMO_PASSWORD, `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
    .refine((p) => new TextEncoder().encode(p).length <= BYTES_MAXIMOS_PASSWORD, {
      message: `La contraseña no puede superar los ${BYTES_MAXIMOS_PASSWORD} bytes.`,
    }),
});

export type ResultadoAlta = { creada: true; usuario: string } | { creada: false; usuario: string; motivo: "existe" };

/**
 * Da de alta una administradora guardando solo el hash. El usuario se guarda normalizado (el login
 * lo compara sin mayúsculas) y uno ya existente no se toca. Lanza `ZodError` si la entrada no vale.
 */
export async function altaAdmin(db: Db, entrada: unknown): Promise<ResultadoAlta> {
  const datos = altaAdminSchema.parse(entrada);
  const usuario = normalizarUsuario(datos.usuario);

  const [existente] = await db
    .select({ id: usuarioAdmin.id })
    .from(usuarioAdmin)
    .where(eq(sql`lower(${usuarioAdmin.usuario})`, usuario))
    .limit(1);
  if (existente) return { creada: false, usuario, motivo: "existe" };

  const passwordHash = await hashearPassword(datos.password);
  const filas = await db
    .insert(usuarioAdmin)
    .values({ usuario, passwordHash })
    .onConflictDoNothing()
    .returning({ id: usuarioAdmin.id });

  return filas.length > 0 ? { creada: true, usuario } : { creada: false, usuario, motivo: "existe" };
}
