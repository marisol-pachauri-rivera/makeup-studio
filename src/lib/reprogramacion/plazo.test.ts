import { describe, expect, it } from "vitest";
import { PLAZO_CANCELACION_HORAS } from "@/lib/cancelacion/plazo";
import { ANTICIPACION_MINIMA_HORAS, puedeReprogramarse } from "./plazo";

const TURNO = new Date("2026-12-24T14:00:00Z");
const antes = (minutos: number) => new Date(TURNO.getTime() - minutos * 60_000);

describe("plazo de reprogramación", () => {
  it("es la misma constante que la de cancelar", () => {
    expect(ANTICIPACION_MINIMA_HORAS).toBe(24);
    expect(ANTICIPACION_MINIMA_HORAS).toBe(PLAZO_CANCELACION_HORAS);
  });

  it("con exactamente 24 horas se puede", () => {
    expect(puedeReprogramarse(TURNO, antes(24 * 60))).toBe(true);
  });

  it("con 23 h 59 min no", () => {
    expect(puedeReprogramarse(TURNO, antes(24 * 60 - 1))).toBe(false);
  });

  it("un turno pasado no", () => {
    expect(puedeReprogramarse(TURNO, new Date(TURNO.getTime() + 1))).toBe(false);
  });
});
