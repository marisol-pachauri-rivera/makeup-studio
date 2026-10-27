import { describe, expect, it, vi } from "vitest";
import { procesarMarcado } from "./formulario-reembolso";

function form(campos: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe("procesarMarcado", () => {
  it("con un id válido marca y devuelve aplicada", async () => {
    const marcar = vi.fn().mockResolvedValue({ estado: "realizado" });
    expect(await procesarMarcado(form({ id: "7" }), { marcar })).toEqual({ estado: "aplicada" });
    expect(marcar).toHaveBeenCalledWith(7);
  });

  it.each([
    ["ausente", {}],
    ["no numérico", { id: "abc" }],
    ["cero", { id: "0" }],
    ["un archivo", { id: new File(["x"], "x.txt") }],
  ])("un id %s responde no encontrada sin llamar a marcar", async (_nombre, campos) => {
    const marcar = vi.fn();
    expect(await procesarMarcado(form(campos), { marcar })).toEqual({ estado: "aviso", mensaje: "No encontramos la reserva." });
    expect(marcar).not.toHaveBeenCalled();
  });

  it.each([
    ["ya_realizado", /ya estaba marcado/],
    ["no_aplica", /no tiene un reembolso/],
    ["no_encontrada", /No encontramos/],
  ] as const)("traduce %s a un aviso", async (estado, texto) => {
    const marcar = vi.fn().mockResolvedValue({ estado });
    const r = await procesarMarcado(form({ id: "7" }), { marcar });
    expect(r).toMatchObject({ estado: "aviso" });
    expect(r.estado === "aviso" && r.mensaje).toMatch(texto);
  });
});
