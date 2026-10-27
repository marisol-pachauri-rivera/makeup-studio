import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { mensajeDockerAusente, verificarAislamiento } from "./support/aislamiento";

// Imagen alineada con la versión mayor de Postgres de Neon (ADR 0011).
const IMAGEN = "postgres:17";

let contenedor: StartedPostgreSqlContainer | undefined;

export async function setup() {
  config({ path: ".env.local", quiet: true });

  try {
    contenedor = await new PostgreSqlContainer(IMAGEN).start();
  } catch (error) {
    // Sin traza: Vitest falla al mapear la de este archivo y taparía el mensaje.
    const aviso = new Error(mensajeDockerAusente(error));
    aviso.stack = aviso.message;
    throw aviso;
  }

  const url = contenedor.getConnectionUri();
  verificarAislamiento(url, process.env.DATABASE_URL);
  process.env.TEST_DATABASE_URL = url;

  // El directorio puede no tener migraciones todavía (journal vacío): es un no-op.
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: resolve("drizzle") });
  } finally {
    await pool.end();
  }
}

export async function teardown() {
  await contenedor?.stop();
}
