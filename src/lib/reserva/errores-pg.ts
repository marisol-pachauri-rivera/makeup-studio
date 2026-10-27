/** SQLSTATE que devuelve Postgres cuando una línea choca con otra por la restricción de exclusión. */
export const EXCLUSION = "23P01";
/** Bloqueo mutuo: en una carrera real Postgres puede abortar al perdedor con esto en vez de `EXCLUSION`. */
export const BLOQUEO_MUTUO = "40P01";
export const UNICO = "23505";

export type ErrorPg = { codigo?: string; restriccion?: string };

/** Código SQLSTATE y restricción del error de Postgres, también cuando Drizzle lo envuelve en `cause`. */
export function leerErrorPg(error: unknown, nivel = 0): ErrorPg {
  if (typeof error !== "object" || error === null) return {};
  const { code, constraint, cause } = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (typeof code === "string") {
    return { codigo: code, restriccion: typeof constraint === "string" ? constraint : undefined };
  }
  return nivel < 2 ? leerErrorPg(cause, nivel + 1) : {};
}

/** El horario lo tomó otra clienta: se muestra el mismo mensaje con cualquiera de los dos códigos. */
export function esChoqueDeHorario(error: unknown): boolean {
  const { codigo } = leerErrorPg(error);
  return codigo === EXCLUSION || codigo === BLOQUEO_MUTUO;
}
