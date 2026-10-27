import { describe, expect, it } from "vitest";
import { limiteDeCancelacion, PLAZO_CANCELACION_HORAS, puedeCancelar } from "./plazo";

const TURNO = new Date("2026-12-24T14:00:00Z");
const antes = (minutos: number) => new Date(TURNO.getTime() - minutos * 60_000);

describe("plazo de cancelación", () => {
  it("son 24 horas", () => {
    expect(PLAZO_CANCELACION_HORAS).toBe(24);
  });

  it("el límite es el primer turno menos 24 horas", () => {
    expect(limiteDeCancelacion(TURNO)).toEqual(new Date("2026-12-23T14:00:00Z"));
  });

  it("con exactamente 24 horas todavía se puede", () => {
    expect(puedeCancelar(TURNO, antes(24 * 60))).toBe(true);
  });

  it("con 23 h 59 min ya no", () => {
    expect(puedeCancelar(TURNO, antes(24 * 60 - 1))).toBe(false);
  });

  it("con 25 horas sí", () => {
    expect(puedeCancelar(TURNO, antes(25 * 60))).toBe(true);
  });

  it("un turno ya pasado no se puede cancelar", () => {
    expect(puedeCancelar(TURNO, new Date(TURNO.getTime() + 1))).toBe(false);
  });
});
