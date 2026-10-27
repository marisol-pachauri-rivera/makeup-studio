import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { conReintentoEnPool } from "./pool-con-reintento";

export function leerDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta la variable de entorno DATABASE_URL.");
  }
  return url;
}

function crearDb() {
  const connectionString = leerDatabaseUrl();
  if (typeof WebSocket === "undefined") {
    neonConfig.webSocketConstructor = ws;
  }
  const pool = conReintentoEnPool(new Pool({ connectionString }));
  return drizzle(pool);
}

let instancia: ReturnType<typeof crearDb> | undefined;

/** Instancia perezosa: leer `DATABASE_URL` al importar rompería `next build` sin base. */
export function getDb() {
  return (instancia ??= crearDb());
}
