import { describe, expect, it, vi } from "vitest";
import {
  procesarAltaMaquilladora,
  procesarAltaServicio,
  procesarCambioDeEstado,
  procesarEdicionMaquilladora,
  procesarEdicionServicio,
} from "./formularios";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const servicioValido = { nombre: "Maquillaje social", descripcion: "", precio: "350,50", duracionMinutos: "60" };

describe("procesarAltaServicio", () => {
  it("con datos válidos crea el servicio normalizado y redirige al listado", async () => {
    const crear = vi.fn().mockResolvedValue({ id: 1 });
    const r = await procesarAltaServicio(form(servicioValido), { crear });
    expect(crear).toHaveBeenCalledWith({ nombre: "Maquillaje social", descripcion: "", precio: "350.50", duracionMinutos: 60 });
    expect(r).toEqual({ redirigirA: "/admin/servicios" });
  });

  it("con un campo inválido no escribe nada, marca el campo y conserva lo escrito", async () => {
    const crear = vi.fn();
    const r = await procesarAltaServicio(form({ ...servicioValido, nombre: "  ", precio: "abc" }), { crear });
    expect(crear).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      errores: { nombre: "El nombre es obligatorio.", precio: expect.stringMatching(/precio/i) },
      valores: { nombre: "  ", precio: "abc", duracionMinutos: "60" },
    });
  });

  it("con campos ausentes los marca todos sin escribir", async () => {
    const crear = vi.fn();
    const r = await procesarAltaServicio(new FormData(), { crear });
    expect(crear).not.toHaveBeenCalled();
    expect(r).toMatchObject({ errores: { nombre: expect.any(String), precio: expect.any(String), duracionMinutos: expect.any(String) } });
  });

  it("un archivo en lugar de texto se trata como dato inválido", async () => {
    const crear = vi.fn();
    const fd = form(servicioValido);
    fd.set("nombre", new File(["x"], "x.txt"));
    const r = await procesarAltaServicio(fd, { crear });
    expect(crear).not.toHaveBeenCalled();
    expect(r).toMatchObject({ errores: { nombre: expect.any(String) }, valores: { nombre: "" } });
  });
});

describe("procesarEdicionServicio", () => {
  it("actualiza por id y redirige", async () => {
    const actualizar = vi.fn().mockResolvedValue({ id: 7 });
    const r = await procesarEdicionServicio(form({ ...servicioValido, id: "7" }), { actualizar });
    expect(actualizar).toHaveBeenCalledWith(7, expect.objectContaining({ precio: "350.50", duracionMinutos: 60 }));
    expect(r).toEqual({ redirigirA: "/admin/servicios" });
  });

  it("un servicio inexistente devuelve noEncontrado", async () => {
    const actualizar = vi.fn().mockResolvedValue(undefined);
    expect(await procesarEdicionServicio(form({ ...servicioValido, id: "99" }), { actualizar })).toEqual({ noEncontrado: true });
  });

  it.each(["", "abc", "0", "-3"])("el id %j devuelve noEncontrado sin tocar la base", async (id) => {
    const actualizar = vi.fn();
    expect(await procesarEdicionServicio(form({ ...servicioValido, id }), { actualizar })).toEqual({ noEncontrado: true });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("un dato inválido no escribe y conserva lo escrito", async () => {
    const actualizar = vi.fn();
    const r = await procesarEdicionServicio(form({ ...servicioValido, id: "7", duracionMinutos: "0" }), { actualizar });
    expect(actualizar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ errores: { duracionMinutos: expect.stringMatching(/duración/i) }, valores: { duracionMinutos: "0" } });
  });
});

describe("procesarAltaMaquilladora y procesarEdicionMaquilladora", () => {
  it("crea con un nombre válido y redirige al listado de maquilladoras", async () => {
    const crear = vi.fn().mockResolvedValue({ id: 1 });
    expect(await procesarAltaMaquilladora(form({ nombre: " Lucía " }), { crear })).toEqual({ redirigirA: "/admin/maquilladoras" });
    expect(crear).toHaveBeenCalledWith({ nombre: "Lucía" });
  });

  it("un nombre vacío no escribe y conserva lo escrito", async () => {
    const crear = vi.fn();
    const r = await procesarAltaMaquilladora(form({ nombre: "   " }), { crear });
    expect(crear).not.toHaveBeenCalled();
    expect(r).toMatchObject({ errores: { nombre: "El nombre es obligatorio." }, valores: { nombre: "   " } });
  });

  it("renombra por id; inexistente o id inválido devuelve noEncontrado", async () => {
    const actualizar = vi.fn().mockResolvedValueOnce({ id: 3 }).mockResolvedValueOnce(undefined);
    expect(await procesarEdicionMaquilladora(form({ id: "3", nombre: "Ana" }), { actualizar })).toEqual({ redirigirA: "/admin/maquilladoras" });
    expect(await procesarEdicionMaquilladora(form({ id: "3", nombre: "Ana" }), { actualizar })).toEqual({ noEncontrado: true });
    expect(await procesarEdicionMaquilladora(form({ id: "x", nombre: "Ana" }), { actualizar })).toEqual({ noEncontrado: true });
    expect(actualizar).toHaveBeenCalledTimes(2);
  });
});

describe("procesarCambioDeEstado", () => {
  it("fija el estado destino que manda el formulario", async () => {
    const cambiar = vi.fn().mockResolvedValue({ id: 5 });
    expect(await procesarCambioDeEstado(form({ id: "5", activo: "false" }), cambiar)).toBe(true);
    expect(cambiar).toHaveBeenCalledWith(5, false);
    await procesarCambioDeEstado(form({ id: "5", activo: "true" }), cambiar);
    expect(cambiar).toHaveBeenLastCalledWith(5, true);
  });

  it("devuelve false si el registro no existe", async () => {
    expect(await procesarCambioDeEstado(form({ id: "5", activo: "true" }), vi.fn().mockResolvedValue(undefined))).toBe(false);
  });

  it.each<Record<string, string>>([
    { id: "5", activo: "quizás" },
    { id: "5" },
    { id: "0", activo: "true" },
    { activo: "true" },
  ])("rechaza la entrada %j sin tocar la base", async (campos) => {
    const cambiar = vi.fn();
    expect(await procesarCambioDeEstado(form(campos), cambiar)).toBe(false);
    expect(cambiar).not.toHaveBeenCalled();
  });
});
