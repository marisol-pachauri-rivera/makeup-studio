import { afterEach, describe, expect, it } from "vitest";
import { hoyLocal } from "@/lib/disponibilidad/fechas";
import { limitesDelDia, semanaDe } from "./rango";

describe("limitesDelDia", () => {
  it("un día de Lima va de las 05:00 UTC a las 05:00 UTC del día siguiente", () => {
    expect(limitesDelDia("2026-12-21")).toEqual({
      inicio: new Date("2026-12-21T05:00:00Z"),
      fin: new Date("2026-12-22T05:00:00Z"),
    });
  });

  it("cruza el fin de mes y de año", () => {
    expect(limitesDelDia("2026-12-31").fin).toEqual(new Date("2027-01-01T05:00:00Z"));
    expect(limitesDelDia("2026-02-28").fin).toEqual(new Date("2026-03-01T05:00:00Z"));
  });

  it("las 03:00 UTC del 25/12 todavía son el 24/12 en Lima y caen dentro de ese día", () => {
    const instante = new Date("2026-12-25T03:00:00Z");
    expect(hoyLocal(instante)).toBe("2026-12-24");
    const { inicio, fin } = limitesDelDia("2026-12-24");
    expect(instante.getTime()).toBeGreaterThanOrEqual(inicio.getTime());
    expect(instante.getTime()).toBeLessThan(fin.getTime());
  });

  it("las 04:59 UTC todavía son el día anterior y las 05:00 UTC ya son el siguiente", () => {
    const { fin } = limitesDelDia("2026-12-24");
    expect(fin).toEqual(new Date("2026-12-25T05:00:00Z"));
    expect(hoyLocal(new Date(fin.getTime() - 60_000))).toBe("2026-12-24");
    expect(hoyLocal(fin)).toBe("2026-12-25");
  });
});

describe("semanaDe", () => {
  it("va de lunes a domingo", () => {
    // 2026-12-23 es miércoles.
    expect(semanaDe("2026-12-23")).toEqual([
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
      "2026-12-27",
    ]);
  });

  it("un lunes abre su semana y un domingo la cierra", () => {
    expect(semanaDe("2026-12-21")[0]).toBe("2026-12-21");
    expect(semanaDe("2026-12-27")[0]).toBe("2026-12-21");
    expect(semanaDe("2026-12-27")[6]).toBe("2026-12-27");
  });

  it("cruza el cambio de mes y de año", () => {
    // 2026-12-31 es jueves.
    expect(semanaDe("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
});

describe("no depende de la zona del proceso", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it.each(["UTC", "America/Lima", "Asia/Tokyo", "Pacific/Auckland"])("con TZ=%s da lo mismo", (tz) => {
    process.env.TZ = tz;
    expect(limitesDelDia("2026-12-21").inicio).toEqual(new Date("2026-12-21T05:00:00Z"));
    expect(semanaDe("2026-12-31")[0]).toBe("2026-12-28");
  });
});
