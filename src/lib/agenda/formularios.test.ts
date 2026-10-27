import { describe, expect, it, vi } from "vitest";
import { MENSAJE_SOLAPADO, procesarAltaBloqueo, procesarAltaHorario, procesarBaja } from "./formularios";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const horario = { maquilladoraId: "3", diaSemana: "1", horaInicio: "09:00", horaFin: "18:00" };
const bloqueo = { maquilladoraId: "3", inicio: "2026-12-24T09:00", fin: "2026-12-26T09:00", motivo: "Vacaciones" };

describe("procesarAltaHorario", () => {
  it("con datos válidos agrega y devuelve la confirmación", async () => {
    const agregar = vi.fn().mockResolvedValue({ estado: "creado", horario: {} });
    expect(await procesarAltaHorario(form(horario), { agregar })).toEqual({ exito: "Tramo agregado." });
    expect(agregar).toHaveBeenCalledWith(3, { diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
  });

  it("con datos inválidos devuelve errores por campo y lo escrito, sin escribir", async () => {
    const agregar = vi.fn();
    const r = await procesarAltaHorario(form({ ...horario, horaInicio: "25:00", horaFin: "10:00" }), { agregar });
    expect(r).toMatchObject({
      errores: { horaInicio: expect.stringContaining("hora de inicio") },
      valores: { diaSemana: "1", horaInicio: "25:00", horaFin: "10:00" },
    });
    expect(agregar).not.toHaveBeenCalled();
  });

  it("con fin no posterior al inicio marca el campo horaFin", async () => {
    const r = await procesarAltaHorario(form({ ...horario, horaFin: "09:00" }), { agregar: vi.fn() });
    expect(r).toMatchObject({ errores: { horaFin: expect.stringContaining("posterior") } });
  });

  it("explica el solapamiento y conserva lo escrito", async () => {
    const agregar = vi.fn().mockResolvedValue({ estado: "solapado" });
    expect(await procesarAltaHorario(form(horario), { agregar })).toEqual({
      mensaje: MENSAJE_SOLAPADO,
      valores: { diaSemana: "1", horaInicio: "09:00", horaFin: "18:00" },
    });
  });

  it("devuelve no encontrado si la maquilladora no existe", async () => {
    const agregar = vi.fn().mockResolvedValue({ estado: "maquilladora_inexistente" });
    expect(await procesarAltaHorario(form(horario), { agregar })).toEqual({ noEncontrado: true });
  });

  it.each(["", "0", "abc"])("devuelve no encontrado con el id de maquilladora %j, sin escribir", async (id) => {
    const agregar = vi.fn();
    expect(await procesarAltaHorario(form({ ...horario, maquilladoraId: id }), { agregar })).toEqual({ noEncontrado: true });
    expect(agregar).not.toHaveBeenCalled();
  });

  it("trata un campo ausente como inválido", async () => {
    const r = await procesarAltaHorario(form({ maquilladoraId: "3" }), { agregar: vi.fn() });
    expect(r).toMatchObject({ errores: expect.objectContaining({ diaSemana: expect.any(String) }) });
  });
});

describe("procesarAltaBloqueo", () => {
  it("con datos válidos agrega con las fechas convertidas a UTC", async () => {
    const agregar = vi.fn().mockResolvedValue({ id: 1 });
    expect(await procesarAltaBloqueo(form(bloqueo), { agregar })).toEqual({ exito: "Bloqueo agregado." });
    const [id, datos] = agregar.mock.calls[0];
    expect(id).toBe(3);
    expect(datos.inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
    expect(datos.motivo).toBe("Vacaciones");
  });

  it("con motivo vacío devuelve el error en el campo y conserva lo escrito", async () => {
    const agregar = vi.fn();
    const r = await procesarAltaBloqueo(form({ ...bloqueo, motivo: "   " }), { agregar });
    expect(r).toMatchObject({
      errores: { motivo: "El motivo es obligatorio." },
      valores: { inicio: bloqueo.inicio, fin: bloqueo.fin, motivo: "   " },
    });
    expect(agregar).not.toHaveBeenCalled();
  });

  it("con fecha inexistente marca el campo", async () => {
    const r = await procesarAltaBloqueo(form({ ...bloqueo, inicio: "2026-02-30T10:00" }), { agregar: vi.fn() });
    expect(r).toMatchObject({ errores: { inicio: expect.any(String) } });
  });

  it("devuelve no encontrado si la maquilladora no existe", async () => {
    const agregar = vi.fn().mockResolvedValue(undefined);
    expect(await procesarAltaBloqueo(form(bloqueo), { agregar })).toEqual({ noEncontrado: true });
  });
});

describe("procesarBaja", () => {
  it("quita con los dos identificadores y confirma", async () => {
    const quitar = vi.fn().mockResolvedValue(true);
    expect(await procesarBaja(form({ maquilladoraId: "3", id: "7" }), quitar)).toBe(true);
    expect(quitar).toHaveBeenCalledWith(3, 7);
  });

  it("no falla si no había nada que borrar", async () => {
    const quitar = vi.fn().mockResolvedValue(false);
    expect(await procesarBaja(form({ maquilladoraId: "3", id: "7" }), quitar)).toBe(true);
  });

  it.each<Record<string, string>>([
    { maquilladoraId: "3" },
    { id: "7" },
    { maquilladoraId: "x", id: "7" },
    { maquilladoraId: "3", id: "0" },
  ])(
    "rechaza identificadores inválidos %j sin borrar",
    async (campos) => {
      const quitar = vi.fn();
      expect(await procesarBaja(form(campos), quitar)).toBe(false);
      expect(quitar).not.toHaveBeenCalled();
    },
  );
});
