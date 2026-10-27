import { beforeEach, describe, expect, it, vi } from "vitest";

class NoAutorizado extends Error {}

const requerirAdmin = vi.fn();
const getDb = vi.fn(() => "db-falsa");
const maquilladoras = {
  crearMaquilladora: vi.fn(),
  actualizarMaquilladora: vi.fn(),
  cambiarActivaMaquilladora: vi.fn(),
};
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
const refresh = vi.fn();

vi.mock("@/lib/auth/sesion", () => ({ requerirAdmin }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/catalogo/maquilladoras", () => maquilladoras);
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ refresh }));

const { actualizarMaquilladora, cambiarEstadoMaquilladora, crearMaquilladora } = await import("./actions");

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requerirAdmin.mockResolvedValue({ id: 1, usuario: "maria" });
});

describe("sin sesión válida ninguna acción toca la base", () => {
  beforeEach(() => {
    requerirAdmin.mockRejectedValue(new NoAutorizado());
  });

  it.each([
    ["crearMaquilladora", () => crearMaquilladora({}, form({ nombre: "Lucía" }))],
    ["actualizarMaquilladora", () => actualizarMaquilladora({}, form({ id: "1", nombre: "Lucía" }))],
    ["cambiarEstadoMaquilladora", () => cambiarEstadoMaquilladora(form({ id: "1", activo: "false" }))],
  ])("%s se rechaza como no autorizada", async (_nombre, invocar) => {
    await expect(invocar()).rejects.toBeInstanceOf(NoAutorizado);
    expect(getDb).not.toHaveBeenCalled();
    expect(maquilladoras.crearMaquilladora).not.toHaveBeenCalled();
    expect(maquilladoras.actualizarMaquilladora).not.toHaveBeenCalled();
    expect(maquilladoras.cambiarActivaMaquilladora).not.toHaveBeenCalled();
  });
});

describe("crearMaquilladora", () => {
  it("con un nombre válido crea y redirige al listado", async () => {
    maquilladoras.crearMaquilladora.mockResolvedValue({ id: 1 });
    await expect(crearMaquilladora({}, form({ nombre: " Lucía " }))).rejects.toThrow("REDIRECT:/admin/maquilladoras");
    expect(maquilladoras.crearMaquilladora).toHaveBeenCalledWith("db-falsa", { nombre: "Lucía" });
  });

  it("con un nombre inválido devuelve el error y lo escrito, sin escribir", async () => {
    const estado = await crearMaquilladora({}, form({ nombre: "   " }));
    expect(estado).toMatchObject({ errores: { nombre: "El nombre es obligatorio." }, valores: { nombre: "   " } });
    expect(maquilladoras.crearMaquilladora).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("actualizarMaquilladora", () => {
  it("renombra y redirige", async () => {
    maquilladoras.actualizarMaquilladora.mockResolvedValue({ id: 4 });
    await expect(actualizarMaquilladora({}, form({ id: "4", nombre: "Ana" }))).rejects.toThrow(
      "REDIRECT:/admin/maquilladoras",
    );
    expect(maquilladoras.actualizarMaquilladora).toHaveBeenCalledWith("db-falsa", 4, { nombre: "Ana" });
  });

  it("una maquilladora inexistente responde no encontrada", async () => {
    maquilladoras.actualizarMaquilladora.mockResolvedValue(undefined);
    await expect(actualizarMaquilladora({}, form({ id: "99", nombre: "Ana" }))).rejects.toThrow("NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("cambiarEstadoMaquilladora", () => {
  it("fija el estado y refresca la página", async () => {
    maquilladoras.cambiarActivaMaquilladora.mockResolvedValue({ id: 2, activa: false });
    await cambiarEstadoMaquilladora(form({ id: "2", activo: "false" }));
    expect(maquilladoras.cambiarActivaMaquilladora).toHaveBeenCalledWith("db-falsa", 2, false);
    expect(refresh).toHaveBeenCalled();
  });

  it("una maquilladora inexistente o una entrada inválida responde no encontrada", async () => {
    maquilladoras.cambiarActivaMaquilladora.mockResolvedValue(undefined);
    await expect(cambiarEstadoMaquilladora(form({ id: "9", activo: "true" }))).rejects.toThrow("NOT_FOUND");
    await expect(cambiarEstadoMaquilladora(form({ id: "x", activo: "true" }))).rejects.toThrow("NOT_FOUND");
    expect(refresh).not.toHaveBeenCalled();
  });
});
