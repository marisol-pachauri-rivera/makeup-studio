/**
 * Alta de una administradora del panel (ADR 0007: no hay registro público).
 *
 *   ADMIN_USUARIO=maria ADMIN_PASSWORD='una clave larga' npm run db:seed-admin
 *
 * Lee DATABASE_URL de `.env.local`. La contraseña viene por entorno para que no quede en el
 * historial del shell ni en Git, y nunca se imprime.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ZodError } from "zod";
import { altaAdmin } from "../src/lib/auth/alta-admin";

config({ path: ".env.local" });

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta la variable de entorno DATABASE_URL.");
    return 1;
  }

  const pool = new Pool({ connectionString: url });
  try {
    const resultado = await altaAdmin(drizzle(pool), {
      usuario: process.env.ADMIN_USUARIO,
      password: process.env.ADMIN_PASSWORD,
    });
    if (!resultado.creada) {
      console.error(`El usuario «${resultado.usuario}» ya existe; no se modificó.`);
      return 1;
    }
    console.log(`Administradora «${resultado.usuario}» creada.`);
    return 0;
  } catch (error) {
    if (error instanceof ZodError) {
      for (const problema of error.issues) console.error(`- ${problema.message}`);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (error: unknown) => {
    // Un fallo de conexión u otro error técnico: se informa el mensaje, sin credenciales.
    console.error(error instanceof Error ? error.message : "Error inesperado.");
    process.exitCode = 1;
  },
);
