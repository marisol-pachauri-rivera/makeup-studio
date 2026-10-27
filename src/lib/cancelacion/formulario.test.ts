import { describe, expect, it, vi } from "vitest";
import { procesarCancelacion } from "./formulario";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

function form(campos: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe("procesarCancelacion", () => {
  it("con un token válido llama a cancelar y devuelve cancelada", async () => {
    const cancelar = vi.fn().mockResolvedValue({ estado: "cancelada" });
    expect(await procesarCancelacion(form({ token: TOKEN }), { cancelar })).toEqual({ estado: "cancelada" });
    expect(cancelar).toHaveBeenCalledWith(TOKEN);
  });

  it.each([
    ["ausente", {}],
    ["mal formado", { token: "abc" }],
    ["un archivo", { token: new File(["x"], "x.txt") }],
  ])("un token %s responde no encontrada sin llamar a cancelar", async (_nombre, campos) => {
    const cancelar = vi.fn();
    expect(await procesarCancelacion(form(campos), { cancelar })).toEqual({
      estado: "rechazada",
      motivo: "no_encontrada",
      mensaje: "No encontramos tu reserva.",
    });
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("ya cancelada por otro motivo", async () => {
    const cancelar = vi.fn().mockResolvedValue({ estado: "ya_cancelada" });
    expect(await procesarCancelacion(form({ token: TOKEN }), { cancelar })).toEqual({
      estado: "rechazada",
      motivo: "ya_cancelada",
      mensaje: "Esta reserva ya estaba cancelada.",
    });
  });

  it("fuera de plazo dice que escriba al studio", async () => {
    const cancelar = vi.fn().mockResolvedValue({ estado: "fuera_de_plazo" });
    const r = await procesarCancelacion(form({ token: TOKEN }), { cancelar });
    expect(r).toMatchObject({ estado: "rechazada", motivo: "fuera_de_plazo" });
    expect(r.estado === "rechazada" && r.mensaje).toMatch(/24 horas.*Escribile al studio/);
  });

  it("token desconocido", async () => {
    const cancelar = vi.fn().mockResolvedValue({ estado: "no_encontrada" });
    expect(await procesarCancelacion(form({ token: TOKEN }), { cancelar })).toMatchObject({
      estado: "rechazada",
      motivo: "no_encontrada",
    });
  });
});
