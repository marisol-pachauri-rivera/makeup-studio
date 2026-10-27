import { describe, expect, it, vi } from "vitest";
import { MENSAJE_NO_ENCONTRADA, procesarCancelacion, procesarRechazo, procesarValidacion } from "./formularios";
import type { ResultadoTransicion } from "./transiciones";

function form(campos: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const aplicada: ResultadoTransicion = { estado: "aplicada" };

describe("procesarValidacion", () => {
  it("con un id válido llama a validar y devuelve aplicada", async () => {
    const validar = vi.fn().mockResolvedValue(aplicada);
    expect(await procesarValidacion(form({ id: "7" }), { validar })).toEqual({ estado: "aplicada" });
    expect(validar).toHaveBeenCalledWith(7);
  });

  it.each([
    ["ausente", {}],
    ["no numérico", { id: "abc" }],
    ["negativo", { id: "-3" }],
    ["un archivo", { id: new File(["x"], "x.txt") }],
  ])("un id %s responde no encontrada sin llamar a validar", async (_nombre, campos) => {
    const validar = vi.fn();
    expect(await procesarValidacion(form(campos), { validar })).toEqual({ estado: "aviso", mensaje: MENSAJE_NO_ENCONTRADA });
    expect(validar).not.toHaveBeenCalled();
  });

  it("ya confirmada: avisa que ya lo estaba", async () => {
    const validar = vi.fn().mockResolvedValue({ estado: "ya_aplicada", actual: "confirmada" });
    expect(await procesarValidacion(form({ id: "7" }), { validar })).toEqual({
      estado: "aviso",
      mensaje: "Esta reserva ya estaba confirmada.",
    });
  });

  it("cambió de estado: dice cuál es el actual", async () => {
    const validar = vi.fn().mockResolvedValue({ estado: "estado_distinto", actual: "cancelada" });
    const r = await procesarValidacion(form({ id: "7" }), { validar });
    expect(r).toMatchObject({ estado: "aviso" });
    expect(r.estado === "aviso" && r.mensaje).toContain("cancelada");
  });

  it("no existe: aviso de no encontrada", async () => {
    const validar = vi.fn().mockResolvedValue({ estado: "no_encontrada" });
    expect(await procesarValidacion(form({ id: "7" }), { validar })).toEqual({
      estado: "aviso",
      mensaje: MENSAJE_NO_ENCONTRADA,
    });
  });
});

describe("procesarRechazo", () => {
  it("recorta el motivo y llama a rechazar", async () => {
    const rechazar = vi.fn().mockResolvedValue(aplicada);
    expect(await procesarRechazo(form({ id: "7", motivo: "  no aparece  " }), { rechazar })).toEqual({ estado: "aplicada" });
    expect(rechazar).toHaveBeenCalledWith(7, "no aparece");
  });

  it.each(["", "   "])("un motivo vacío (%j) da el error junto al campo y no llama a rechazar", async (motivo) => {
    const rechazar = vi.fn();
    const r = await procesarRechazo(form({ id: "7", motivo }), { rechazar });
    expect(r).toEqual({
      estado: "invalido",
      errores: { motivo: "Escribí el motivo del rechazo." },
      valores: { motivo },
    });
    expect(rechazar).not.toHaveBeenCalled();
  });

  it("un motivo demasiado largo conserva lo escrito y no llama a rechazar", async () => {
    const rechazar = vi.fn();
    const largo = "a".repeat(301);
    const r = await procesarRechazo(form({ id: "7", motivo: largo }), { rechazar });
    expect(r).toMatchObject({ estado: "invalido", errores: { motivo: expect.stringContaining("300") }, valores: { motivo: largo } });
    expect(rechazar).not.toHaveBeenCalled();
  });

  it("entradas manipuladas no lanzan: id inválido es no encontrada, motivo ausente es inválido", async () => {
    const rechazar = vi.fn();
    expect(await procesarRechazo(form({ id: "x", motivo: "ok" }), { rechazar })).toEqual({
      estado: "aviso",
      mensaje: MENSAJE_NO_ENCONTRADA,
    });
    expect(await procesarRechazo(form({ id: "7" }), { rechazar })).toMatchObject({
      estado: "invalido",
      valores: { motivo: "" },
    });
    expect(await procesarRechazo(form({ id: "7", motivo: new File(["x"], "x.txt") }), { rechazar })).toMatchObject({
      estado: "invalido",
    });
    expect(rechazar).not.toHaveBeenCalled();
  });

  it("estado distinto: avisa el estado actual", async () => {
    const rechazar = vi.fn().mockResolvedValue({ estado: "estado_distinto", actual: "confirmada" });
    const r = await procesarRechazo(form({ id: "7", motivo: "no aparece" }), { rechazar });
    expect(r.estado === "aviso" && r.mensaje).toContain("confirmada");
  });
});

describe("procesarCancelacion", () => {
  it("con la confirmación llama a cancelar", async () => {
    const cancelar = vi.fn().mockResolvedValue(aplicada);
    expect(await procesarCancelacion(form({ id: "7", confirmar: "true" }), { cancelar })).toEqual({ estado: "aplicada" });
    expect(cancelar).toHaveBeenCalledWith(7);
  });

  it.each<Record<string, string>>([{}, { confirmar: "false" }, { confirmar: "" }])("sin confirmación (%j) no cancela y devuelve un mensaje", async (extra) => {
    const cancelar = vi.fn();
    const r = await procesarCancelacion(form({ id: "7", ...extra }), { cancelar });
    expect(r).toEqual({ estado: "aviso", mensaje: "Confirmá la cancelación para continuar." });
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("un id inválido responde no encontrada sin llamar a cancelar", async () => {
    const cancelar = vi.fn();
    expect(await procesarCancelacion(form({ id: "abc", confirmar: "true" }), { cancelar })).toEqual({
      estado: "aviso",
      mensaje: MENSAJE_NO_ENCONTRADA,
    });
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("ya cancelada: avisa que ya lo estaba", async () => {
    const cancelar = vi.fn().mockResolvedValue({ estado: "ya_aplicada", actual: "cancelada" });
    expect(await procesarCancelacion(form({ id: "7", confirmar: "true" }), { cancelar })).toEqual({
      estado: "aviso",
      mensaje: "Esta reserva ya estaba cancelada.",
    });
  });
});
