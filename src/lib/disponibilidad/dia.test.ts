import { describe, expect, it } from "vitest";
import { elegirDia } from "./dia";

const dia = (fecha: string) => ({ fecha, inicios: [new Date(`${fecha}T14:00:00Z`)] });
const dias = [dia("2026-12-22"), dia("2026-12-24"), dia("2026-12-28")];

describe("elegirDia", () => {
  it("devuelve el día pedido si tiene turnos", () => {
    expect(elegirDia(dias, "2026-12-24")?.fecha).toBe("2026-12-24");
  });

  it("devuelve el primero si no se pidió ninguno", () => {
    expect(elegirDia(dias)?.fecha).toBe("2026-12-22");
  });

  it("devuelve el primero si el pedido no tiene turnos o está fuera de la lista", () => {
    expect(elegirDia(dias, "2026-12-23")?.fecha).toBe("2026-12-22");
    expect(elegirDia(dias, "2030-01-01")?.fecha).toBe("2026-12-22");
  });

  it("devuelve undefined si no hay ningún día", () => {
    expect(elegirDia([], "2026-12-24")).toBeUndefined();
    expect(elegirDia([])).toBeUndefined();
  });
});
