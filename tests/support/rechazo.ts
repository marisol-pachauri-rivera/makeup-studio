import type { Tx } from "./db";

export interface Rechazo {
  codigo: string;
  restriccion?: string;
}

interface ErrorPg {
  code?: unknown;
  constraint?: unknown;
}

/**
 * Ejecuta `fn` dentro de un SAVEPOINT y devuelve el rechazo de la base. Tras un error Postgres
 * aborta la transacción entera; el savepoint deja la externa utilizable. Falla si `fn` se acepta.
 */
export async function esperarRechazo(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<Rechazo> {
  try {
    await tx.transaction((sp) => fn(sp as Tx));
  } catch (error) {
    // Drizzle envuelve el error de pg en `cause`.
    const pg = ((error as { cause?: ErrorPg }).cause ?? error) as ErrorPg;
    if (typeof pg.code === "string") {
      return {
        codigo: pg.code,
        restriccion: typeof pg.constraint === "string" ? pg.constraint : undefined,
      };
    }
    throw error;
  }
  throw new Error("Se esperaba un rechazo de la base, pero la operación se aceptó.");
}
