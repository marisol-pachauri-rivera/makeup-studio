import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const ROLLBACK = Symbol("rollback");

export function crearDbDePrueba() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL no está definida: ¿se ejecutó el globalSetup de integración?");
  }
  const pool = new Pool({ connectionString: url });
  return {
    db: drizzle(pool),
    /**
     * Al terminar un archivo de pruebas deja las tablas vacías. Los archivos de integración comparten una
     * sola base y corren en un orden que varía: uno que cuenta filas globales no debe heredar lo que dejó
     * el anterior.
     */
    cerrar: async () => {
      try {
        await pool.query(`truncate table ${TABLAS_DE_DATOS} restart identity cascade`);
      } finally {
        await pool.end();
      }
    },
  };
}

const TABLAS_DE_DATOS =
  "reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora, usuario_admin, intento_login";

export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** Ejecuta `fn` en una transacción que siempre se revierte: el estado no pasa de un test a otro. */
export async function enTransaccionRevertida<T>(db: NodePgDatabase, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let resultado!: T;
  try {
    await db.transaction(async (tx) => {
      resultado = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return resultado;
}
