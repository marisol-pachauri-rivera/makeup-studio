import { afterEach, describe, expect, it } from "vitest";
import { diaDeLaSemana, hoyLocal, sumarDias } from "./fechas";

describe("hoyLocal", () => {
  it("sigue en el día anterior cuando en UTC ya es el siguiente", () => {
    expect(hoyLocal(new Date("2026-12-25T03:00:00Z"))).toBe("2026-12-24");
  });

  it("cambia de día a medianoche de Lima (05:00 UTC)", () => {
    expect(hoyLocal(new Date("2026-12-25T04:59:00Z"))).toBe("2026-12-24");
    expect(hoyLocal(new Date("2026-12-25T05:00:00Z"))).toBe("2026-12-25");
  });
});

describe("sumarDias", () => {
  it("suma dentro del mes", () => {
    expect(sumarDias("2026-12-10", 5)).toBe("2026-12-15");
  });

  it("cruza mes y año", () => {
    expect(sumarDias("2026-12-25", 10)).toBe("2027-01-04");
    expect(sumarDias("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("acepta 0 y negativos", () => {
    expect(sumarDias("2026-12-25", 0)).toBe("2026-12-25");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rechaza texto que no es una fecha", () => {
    expect(() => sumarDias("25/12/2026", 1)).toThrow("Fecha inválida");
  });
});

describe("diaDeLaSemana", () => {
  it.each([
    ["2026-12-25", 5], // viernes
    ["2026-12-27", 0], // domingo
    ["2026-12-28", 1], // lunes
    ["2027-01-02", 6], // sábado
  ])("el %s es el día %i", (fecha, dia) => {
    expect(diaDeLaSemana(fecha)).toBe(dia);
  });
});

describe("independencia de la zona del proceso", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it.each(["UTC", "Asia/Tokyo", "America/New_York"])("da el mismo resultado con TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(hoyLocal(new Date("2026-12-25T03:00:00Z"))).toBe("2026-12-24");
    expect(sumarDias("2026-12-25", 10)).toBe("2027-01-04");
    expect(diaDeLaSemana("2026-12-25")).toBe(5);
  });
});
