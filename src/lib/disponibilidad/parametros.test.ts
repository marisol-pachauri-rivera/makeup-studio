import { describe, expect, it } from "vitest";
import { leerParametros } from "./parametros";

describe("leerParametros", () => {
  it("acepta una maquilladora y una fecha válidas", () => {
    expect(leerParametros({ maquilladora: "3", fecha: "2026-12-24" })).toEqual({
      maquilladoraId: 3,
      fecha: "2026-12-24",
    });
  });

  it("todo es opcional", () => {
    expect(leerParametros({})).toEqual({ maquilladoraId: undefined, fecha: undefined });
  });

  it.each(["abc", "0", "-1", "1.5", "", " ", "1e3", "99999999999"])("ignora la maquilladora %j", (maquilladora) => {
    expect(leerParametros({ maquilladora }).maquilladoraId).toBeUndefined();
  });

  it.each(["2026-02-30", "2026-13-01", "2026-12-32", "24/12/2026", "2026-1-5", "", "hoy", "2026-12-24T09:00"])(
    "ignora la fecha %j",
    (fecha) => {
      expect(leerParametros({ fecha }).fecha).toBeUndefined();
    },
  );

  it("acepta el 29 de febrero solo en año bisiesto", () => {
    expect(leerParametros({ fecha: "2028-02-29" }).fecha).toBe("2028-02-29");
    expect(leerParametros({ fecha: "2027-02-29" }).fecha).toBeUndefined();
  });

  it("un parámetro repetido se trata como ausente", () => {
    expect(leerParametros({ maquilladora: ["1", "2"], fecha: ["2026-12-24", "2026-12-25"] })).toEqual({
      maquilladoraId: undefined,
      fecha: undefined,
    });
  });

  it("un valor inválido de uno no invalida al otro", () => {
    expect(leerParametros({ maquilladora: "abc", fecha: "2026-12-24" })).toEqual({
      maquilladoraId: undefined,
      fecha: "2026-12-24",
    });
  });
});
