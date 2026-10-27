import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { accionesSinGuardia } from "./acciones-sin-guardia";

const RAIZ_PANEL = resolve("src/app/admin");
// El login es la única acción pública del panel: no puede exigir una sesión que aún no existe.
const EXCLUIDAS = [join(RAIZ_PANEL, "login")];

function archivosDeAcciones(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (EXCLUIDAS.includes(ruta)) return [];
    if (statSync(ruta).isDirectory()) return archivosDeAcciones(ruta);
    return nombre === "actions.ts" ? [ruta] : [];
  });
}

describe("accionesSinGuardia (el verificador)", () => {
  const bien = `"use server";
import { requerirAdmin } from "@/lib/auth/sesion";
export async function crearServicio(datos: unknown) {
  await requerirAdmin();
  const parsed = esquema.parse(datos);
  return getDb().insert(servicio).values(parsed);
}
export const desactivar = async (id: number) => {
  await requerirAdmin();
  await getDb().update(servicio).set({ activo: false });
};
`;

  it("acepta acciones que llaman al guardia primero", () => {
    expect(accionesSinGuardia(bien)).toEqual([]);
  });

  it("detecta una acción sin guardia", () => {
    const mal = bien.replace("export const desactivar = async (id: number) => {\n  await requerirAdmin();", "export const desactivar = async (id: number) => {");
    expect(accionesSinGuardia(mal)).toEqual(["desactivar: no llama a requerirAdmin()"]);
  });

  it("detecta una acción que toca la base antes del guardia", () => {
    const mal = `"use server";
export async function borrar(id: number) {
  const datos = await getDb().select().from(servicio);
  await requerirAdmin();
}
`;
    expect(accionesSinGuardia(mal)).toEqual(["borrar: requerirAdmin() no es lo primero que hace la acción"]);
  });

  it("no confunde requerirAdminOLogin con el guardia de acciones", () => {
    const mal = `"use server";
export async function x() {
  await requerirAdminOLogin();
}
`;
    expect(accionesSinGuardia(mal)).toEqual(["x: no llama a requerirAdmin()"]);
  });

  it("exige la directiva use server y rechaza exportaciones no asíncronas", () => {
    const mal = `export function sincrona() { return 1; }\nexport async function a() { await requerirAdmin(); }`;
    const problemas = accionesSinGuardia(mal);
    expect(problemas.some((p) => p.includes("use server"))).toBe(true);
    expect(problemas.some((p) => p.includes("no asíncrona"))).toBe(true);
  });
});

describe("Server Actions del panel", () => {
  const archivos = archivosDeAcciones(RAIZ_PANEL);

  it("hoy no hay acciones protegidas (se agregan desde el ítem #4); la convención ya está activa", () => {
    expect(Array.isArray(archivos)).toBe(true);
  });

  it.each(archivos.map((a) => [relative(process.cwd(), a).split(sep).join("/"), a]))(
    "%s: toda acción exportada llama a requerirAdmin() primero",
    (_nombre, ruta) => {
      expect(accionesSinGuardia(readFileSync(ruta, "utf8"))).toEqual([]);
    },
  );
});
