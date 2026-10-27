import { beforeEach, describe, expect, it, vi } from "vitest";

class NoAutorizado extends Error {}

const requerirAdmin = vi.fn();
const getDb = vi.fn(() => "db-falsa");
const servicios = {
  crearServicio: vi.fn(),
  actualizarServicio: vi.fn(),
  cambiarActivoServicio: vi.fn(),
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
vi.mock("@/lib/catalogo/servicios", () => servicios);
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ refresh }));

const { actualizarServicio, cambiarEstadoServicio, crearServicio } = await import("./actions");

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const valido = { nombre: "Maquillaje social", descripcion: "", precio: "350", duracionMinutos: "60" };

beforeEach(() => {
  vi.clearAllMocks();
  requerirAdmin.mockResolvedValue({ id: 1, usuario: "maria" });
});

describe("sin sesión válida ninguna acción toca la base", () => {
  beforeEach(() => {
    requerirAdmin.mockRejectedValue(new NoAutorizado());
  });

  it.each([
    ["crearServicio", () => crearServicio({}, form(valido))],
    ["actualizarServicio", () => actualizarServicio({}, form({ ...valido, id: "1" }))],
    ["cambiarEstadoServicio", () => cambiarEstadoServicio(form({ id: "1", activo: "false" }))],
  ])("%s se rechaza como no autorizada", async (_nombre, invocar) => {
    await expect(invocar()).rejects.toBeInstanceOf(NoAutorizado);
    expect(getDb).not.toHaveBeenCalled();
    expect(servicios.crearServicio).not.toHaveBeenCalled();
    expect(servicios.actualizarServicio).not.toHaveBeenCalled();
    expect(servicios.cambiarActivoServicio).not.toHaveBeenCalled();
  });
});

describe("crearServicio", () => {
  it("con datos válidos crea y redirige al listado", async () => {
    servicios.crearServicio.mockResolvedValue({ id: 1 });
    await expect(crearServicio({}, form(valido))).rejects.toThrow("REDIRECT:/admin/servicios");
    expect(servicios.crearServicio).toHaveBeenCalledWith("db-falsa", expect.objectContaining({ precio: "350.00", duracionMinutos: 60 }));
  });

  it("con datos inválidos devuelve errores por campo y valores conservados, sin escribir", async () => {
    const estado = await crearServicio({}, form({ ...valido, nombre: "", precio: "-1" }));
    expect(estado).toMatchObject({ errores: { nombre: expect.any(String), precio: expect.any(String) }, valores: { precio: "-1" } });
    expect(servicios.crearServicio).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("actualizarServicio", () => {
  it("actualiza y redirige", async () => {
    servicios.actualizarServicio.mockResolvedValue({ id: 4 });
    await expect(actualizarServicio({}, form({ ...valido, id: "4" }))).rejects.toThrow("REDIRECT:/admin/servicios");
    expect(servicios.actualizarServicio).toHaveBeenCalledWith("db-falsa", 4, expect.any(Object));
  });

  it("un servicio inexistente responde no encontrado", async () => {
    servicios.actualizarServicio.mockResolvedValue(undefined);
    await expect(actualizarServicio({}, form({ ...valido, id: "99" }))).rejects.toThrow("NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("cambiarEstadoServicio", () => {
  it("fija el estado y refresca la página", async () => {
    servicios.cambiarActivoServicio.mockResolvedValue({ id: 2, activo: false });
    await cambiarEstadoServicio(form({ id: "2", activo: "false" }));
    expect(servicios.cambiarActivoServicio).toHaveBeenCalledWith("db-falsa", 2, false);
    expect(refresh).toHaveBeenCalled();
  });

  it("un servicio inexistente o una entrada inválida responde no encontrado", async () => {
    servicios.cambiarActivoServicio.mockResolvedValue(undefined);
    await expect(cambiarEstadoServicio(form({ id: "9", activo: "true" }))).rejects.toThrow("NOT_FOUND");
    await expect(cambiarEstadoServicio(form({ id: "x", activo: "true" }))).rejects.toThrow("NOT_FOUND");
    expect(refresh).not.toHaveBeenCalled();
  });
});
