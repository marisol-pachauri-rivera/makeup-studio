import { describe, expect, it } from "vitest";
import { bloqueoSchema, horarioSchema, MAX_MOTIVO } from "./esquemas";

const horarioValido = { diaSemana: "1", horaInicio: "09:00", horaFin: "18:00" };

describe("horarioSchema", () => {
  it("acepta un tramo válido y convierte el día a número", () => {
    expect(horarioSchema.parse(horarioValido)).toEqual({ diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
  });

  it("acepta el domingo (0) y el sábado (6)", () => {
    expect(horarioSchema.parse({ ...horarioValido, diaSemana: "0" }).diaSemana).toBe(0);
    expect(horarioSchema.parse({ ...horarioValido, diaSemana: "6" }).diaSemana).toBe(6);
  });

  it.each(["7", "-1", "", "lunes", "01"])("rechaza el día %j", (diaSemana) => {
    const r = horarioSchema.safeParse({ ...horarioValido, diaSemana });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["diaSemana"]);
  });

  it.each(["24:00", "9:5", "09:60", "25:00", "", "9:00", "09:00:00"])("rechaza la hora %j", (horaInicio) => {
    const r = horarioSchema.safeParse({ ...horarioValido, horaInicio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["horaInicio"]);
  });

  it("rechaza fin igual al inicio con el error en horaFin", () => {
    const r = horarioSchema.safeParse({ ...horarioValido, horaFin: "09:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["horaFin"]);
  });

  it("rechaza fin anterior al inicio", () => {
    expect(horarioSchema.safeParse({ ...horarioValido, horaInicio: "18:00", horaFin: "09:00" }).success).toBe(false);
  });

  it("rechaza campos ausentes", () => {
    expect(horarioSchema.safeParse({}).success).toBe(false);
  });
});

const bloqueoValido = { inicio: "2026-12-24T14:00", fin: "2026-12-26T09:00", motivo: "Vacaciones" };

describe("bloqueoSchema", () => {
  it("acepta un bloqueo válido y convierte la hora local de Lima a UTC", () => {
    const datos = bloqueoSchema.parse(bloqueoValido);
    expect(datos.inicio.toISOString()).toBe("2026-12-24T19:00:00.000Z");
    expect(datos.fin.toISOString()).toBe("2026-12-26T14:00:00.000Z");
    expect(datos.motivo).toBe("Vacaciones");
  });

  it("recorta el motivo", () => {
    expect(bloqueoSchema.parse({ ...bloqueoValido, motivo: "  Feriado  " }).motivo).toBe("Feriado");
  });

  it.each(["", "   "])("rechaza el motivo vacío %j", (motivo) => {
    const r = bloqueoSchema.safeParse({ ...bloqueoValido, motivo });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["motivo"]);
  });

  it("acepta un motivo de 200 caracteres y rechaza uno de 201", () => {
    expect(bloqueoSchema.safeParse({ ...bloqueoValido, motivo: "a".repeat(MAX_MOTIVO) }).success).toBe(true);
    const r = bloqueoSchema.safeParse({ ...bloqueoValido, motivo: "a".repeat(MAX_MOTIVO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["motivo"]);
  });

  it("rechaza una fecha inexistente en el campo que corresponde", () => {
    const r = bloqueoSchema.safeParse({ ...bloqueoValido, inicio: "2026-02-30T10:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["inicio"]);
  });

  it("rechaza un fin inexistente", () => {
    const r = bloqueoSchema.safeParse({ ...bloqueoValido, fin: "2026-12-26T25:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["fin"]);
  });

  it("rechaza fin igual al inicio con el error en fin", () => {
    const r = bloqueoSchema.safeParse({ ...bloqueoValido, fin: bloqueoValido.inicio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["fin"]);
  });

  it("rechaza fin anterior al inicio", () => {
    expect(bloqueoSchema.safeParse({ ...bloqueoValido, inicio: bloqueoValido.fin, fin: bloqueoValido.inicio }).success).toBe(false);
  });

  it("rechaza campos ausentes", () => {
    expect(bloqueoSchema.safeParse({}).success).toBe(false);
  });
});
