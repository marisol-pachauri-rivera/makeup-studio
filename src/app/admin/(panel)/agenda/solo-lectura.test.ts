import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARPETA = __dirname;

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

describe("la agenda del panel es de solo lectura (ADR 0006)", () => {
  const todos = archivos(CARPETA);

  it("hay archivos que revisar", () => {
    expect(todos.some((ruta) => ruta.endsWith("page.tsx"))).toBe(true);
  });

  it("no existe ningún actions.ts", () => {
    expect(todos.filter((ruta) => /(^|[\\/])actions\.tsx?$/.test(ruta))).toEqual([]);
  });

  it("ningún archivo declara una Server Action ni un componente de cliente", () => {
    const conDirectiva = todos
      .filter((ruta) => /\.tsx?$/.test(ruta) && !/\.test\.tsx?$/.test(ruta))
      .filter((ruta) => /^\s*["']use (server|client)["']/m.test(readFileSync(ruta, "utf8")));
    expect(conDirectiva).toEqual([]);
  });
});
