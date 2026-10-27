/** Aborta si la URL de pruebas pudiera apuntar a una base de desarrollo o producción. */
export function verificarAislamiento(urlDePruebas: string, databaseUrl: string | undefined): void {
  if (databaseUrl && urlDePruebas === databaseUrl) {
    throw new Error(
      "La URL de la base de pruebas coincide con DATABASE_URL. Los tests no pueden usar la base de desarrollo ni la de producción.",
    );
  }
  if (/neon\.tech/i.test(urlDePruebas)) {
    throw new Error("La base de pruebas no puede ser una base de Neon: los tests usan un Postgres local en contenedor.");
  }
}

export function mensajeDockerAusente(causa: unknown): string {
  const detalle = causa instanceof Error ? causa.message : String(causa);
  return [
    "No se pudo levantar el PostgreSQL de pruebas.",
    "Los tests con base de datos requieren Docker en ejecución (ADR 0011).",
    "Iniciá Docker Desktop (o el daemon) y volvé a correr `npm run test`.",
    "Para correr solo los tests sin base: `npm run test:unit`.",
    `Detalle: ${detalle}`,
  ].join("\n");
}
