import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { intentoLogin } from "@/db/schema";

/** Política del ADR 0012: 5 fallos por usuario dentro de 15 minutos bloquean nuevos intentos. */
export const MAX_INTENTOS_FALLIDOS = 5;
export const VENTANA_INTENTOS_MS = 15 * 60_000;

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type EstadoLimite = { bloqueado: false } | { bloqueado: true; reintentarEn: Date };

export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/**
 * Dice si `usuario` (ya normalizado) puede intentar iniciar sesión. Borra de paso sus fallos
 * vencidos: la limpieza es lazy porque no hay cron (ADR 0012). No registra nada.
 */
export async function consultarLimite(db: Db, usuario: string, ahora: Date = new Date()): Promise<EstadoLimite> {
  const desde = new Date(ahora.getTime() - VENTANA_INTENTOS_MS);
  await db.delete(intentoLogin).where(and(eq(intentoLogin.usuario, usuario), lt(intentoLogin.intentadoEn, desde)));

  const fallos = await db
    .select({ intentadoEn: intentoLogin.intentadoEn })
    .from(intentoLogin)
    .where(and(eq(intentoLogin.usuario, usuario), gte(intentoLogin.intentadoEn, desde)))
    .orderBy(asc(intentoLogin.intentadoEn));

  if (fallos.length < MAX_INTENTOS_FALLIDOS) return { bloqueado: false };

  // Vuelve a haber menos de MAX fallos cuando sale de la ventana el que deja el conteo bajo el tope.
  const decisivo = fallos[fallos.length - MAX_INTENTOS_FALLIDOS].intentadoEn;
  return { bloqueado: true, reintentarEn: new Date(decisivo.getTime() + VENTANA_INTENTOS_MS) };
}

export async function registrarFallo(db: Db, usuario: string, ahora: Date = new Date()): Promise<void> {
  await db.insert(intentoLogin).values({ usuario, intentadoEn: ahora });
}

export async function borrarFallos(db: Db, usuario: string): Promise<void> {
  await db.delete(intentoLogin).where(eq(intentoLogin.usuario, usuario));
}
