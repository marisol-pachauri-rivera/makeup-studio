import { describe, expect, it, vi } from "vitest";
import { MENSAJES, procesarReprogramacion } from "./formulario";
import type { ResultadoReprogramacion } from "./reprogramar";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

const completo = (extra: Record<string, string | File> = {}) => {
  const fd = new FormData();
  const campos: Record<string, string | File> = {
    token: TOKEN,
    lineaId: "7",
    maquilladoraId: "2",
    inicio: "2026-12-28T17:00:00.000Z",
    inicioVisto: "2026-12-28T15:00:00.000Z",
    maquilladoraVistaId: "1",
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

describe("procesarReprogramacion", () => {
  it("con todo válido llama a reprogramar con instantes como Date y devuelve el token para volver", async () => {
    const reprogramar = vi.fn().mockResolvedValue({ estado: "reprogramada", repetida: false });

    expect(await procesarReprogramacion(completo(), { reprogramar })).toEqual({ estado: "reprogramada", token: TOKEN });

    expect(reprogramar).toHaveBeenCalledExactlyOnceWith({
      token: TOKEN,
      lineaId: 7,
      maquilladoraId: 2,
      inicio: new Date("2026-12-28T17:00:00.000Z"),
      inicioVisto: new Date("2026-12-28T15:00:00.000Z"),
      maquilladoraVistaId: 1,
    });
  });

  it("un éxito repetido (doble clic) también vuelve a la página de estado", async () => {
    const reprogramar = vi.fn().mockResolvedValue({ estado: "reprogramada", repetida: true });
    expect(await procesarReprogramacion(completo(), { reprogramar })).toEqual({ estado: "reprogramada", token: TOKEN });
  });

  it.each([
    ["token mal formado", { token: "abc" }],
    ["id de turno no numérico", { lineaId: "abc" }],
    ["id de turno cero", { lineaId: "0" }],
    ["maquilladora negativa", { maquilladoraId: "-1" }],
    ["inicio que no es un instante", { inicio: "mañana" }],
    ["inicio visto sin zona", { inicioVisto: "2026-12-28T15:00:00" }],
    ["un archivo en vez de un id", { lineaId: new File(["x"], "x.txt") }],
  ])("%s responde no encontrada sin llamar a reprogramar", async (_nombre, extra) => {
    const reprogramar = vi.fn();
    expect(await procesarReprogramacion(completo(extra), { reprogramar })).toEqual({
      estado: "rechazada",
      motivo: "no_encontrada",
      mensaje: MENSAJES.no_encontrada,
    });
    expect(reprogramar).not.toHaveBeenCalled();
  });

  it("campos ausentes no lanzan", async () => {
    const reprogramar = vi.fn();
    expect(await procesarReprogramacion(new FormData(), { reprogramar })).toMatchObject({ motivo: "no_encontrada" });
    expect(reprogramar).not.toHaveBeenCalled();
  });

  it.each([
    "horario_no_disponible",
    "fuera_de_plazo",
    "no_reprogramable",
    "turno_cambiado",
    "no_encontrada",
    "maquilladora_no_disponible",
  ] as const)("traduce %s a su mensaje", async (estado) => {
    const reprogramar = vi.fn().mockResolvedValue({ estado } satisfies ResultadoReprogramacion);
    expect(await procesarReprogramacion(completo(), { reprogramar })).toEqual({
      estado: "rechazada",
      motivo: estado,
      mensaje: MENSAJES[estado],
    });
  });

  it("el mensaje del plazo explica las 24 horas y que escriba al studio; el de horario ocupado dice que el turno sigue igual", () => {
    expect(MENSAJES.fuera_de_plazo).toMatch(/24 horas.*Escribile al studio/);
    expect(MENSAJES.horario_no_disponible).toMatch(/turno original sigue igual/);
  });
});
