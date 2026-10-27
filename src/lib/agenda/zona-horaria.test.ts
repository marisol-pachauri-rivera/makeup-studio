import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { aPartesLocales, deLocalAInstante, ZONA_STUDIO } from "./zona-horaria";

describe("deLocalAInstante", () => {
  it("convierte las 09:00 locales de Lima a las 14:00 UTC", () => {
    expect(deLocalAInstante("2026-12-24T09:00")?.toISOString()).toBe("2026-12-24T14:00:00.000Z");
  });

  it("maneja el cambio de día hacia adelante", () => {
    expect(deLocalAInstante("2026-12-31T23:30")?.toISOString()).toBe("2027-01-01T04:30:00.000Z");
  });

  it("hace ida y vuelta sin perder la hora", () => {
    for (const texto of ["2026-01-01T00:00", "2026-06-15T12:34", "2026-12-31T23:59"]) {
      const instante = deLocalAInstante(texto);
      expect(instante).not.toBeNull();
      expect(aPartesLocales(instante as Date).texto).toBe(texto);
    }
  });

  it.each(["2026-02-30T10:00", "2026-13-01T10:00", "2026-12-24T25:00", "2026-12-24T10:60", "2026-12-24 10:00", "", "2026-12-24"])(
    "rechaza %j",
    (texto) => {
      expect(deLocalAInstante(texto)).toBeNull();
    },
  );

  it("no acepta segundos ni zona en el texto", () => {
    expect(deLocalAInstante("2026-12-24T09:00:00")).toBeNull();
    expect(deLocalAInstante("2026-12-24T09:00Z")).toBeNull();
  });
});

describe("aPartesLocales", () => {
  it("expresa un instante UTC en hora de Lima", () => {
    expect(aPartesLocales(new Date("2026-12-24T14:00:00Z"))).toEqual({
      fecha: "2026-12-24",
      hora: "09:00",
      texto: "2026-12-24T09:00",
    });
  });

  it("muestra medianoche como 00:00 y no como 24:00", () => {
    expect(aPartesLocales(new Date("2026-12-25T05:00:00Z")).hora).toBe("00:00");
  });

  it("usa la zona del studio", () => {
    expect(ZONA_STUDIO).toBe("America/Lima");
  });
});

describe("independencia de la zona del proceso", () => {
  it.each(["UTC", "Asia/Tokyo", "America/New_York"])("da el mismo resultado con TZ=%s", (tz) => {
    const salida = execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--input-type=module",
        "-e",
        `import { deLocalAInstante, aPartesLocales } from ${JSON.stringify(pathToFileURL(resolve("src/lib/agenda/zona-horaria.ts")).href)};
         const i = deLocalAInstante("2026-12-24T09:00");
         console.log(i.toISOString(), aPartesLocales(i).texto);`,
      ],
      { env: { ...process.env, TZ: tz }, encoding: "utf8" },
    );
    expect(salida.trim()).toBe("2026-12-24T14:00:00.000Z 2026-12-24T09:00");
  });
});
