import { describe, expect, it } from "vitest";
import {
  cancelacionSchema,
  idReservaSchema,
  leerParametrosDeLista,
  MAX_MOTIVO_RECHAZO,
  rechazoSchema,
} from "./esquemas";

describe("idReservaSchema", () => {
  it("acepta un entero positivo en texto", () => {
    expect(idReservaSchema.parse("12")).toBe(12);
  });

  it.each(["abc", "-1", "0", "", "1.5", "12abc"])("rechaza %j", (valor) => {
    expect(idReservaSchema.safeParse(valor).success).toBe(false);
  });

  it("rechaza un campo ausente", () => {
    expect(idReservaSchema.safeParse(undefined).success).toBe(false);
    expect(idReservaSchema.safeParse(null).success).toBe(false);
  });
});

describe("rechazoSchema", () => {
  it("recorta el motivo", () => {
    expect(rechazoSchema.parse({ id: "3", motivo: "  no coincide  " })).toEqual({ id: 3, motivo: "no coincide" });
  });

  it.each(["", "   "])("rechaza el motivo vacío %j con el mensaje junto al campo", (motivo) => {
    const r = rechazoSchema.safeParse({ id: "3", motivo });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["motivo"], message: "Escribí el motivo del rechazo." });
  });

  it("acepta 300 caracteres y rechaza 301", () => {
    expect(rechazoSchema.safeParse({ id: "3", motivo: "a".repeat(MAX_MOTIVO_RECHAZO) }).success).toBe(true);
    const r = rechazoSchema.safeParse({ id: "3", motivo: "a".repeat(MAX_MOTIVO_RECHAZO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["motivo"]);
  });

  it("rechaza un motivo ausente o un id inválido", () => {
    expect(rechazoSchema.safeParse({ id: "3", motivo: null }).success).toBe(false);
    expect(rechazoSchema.safeParse({ id: "x", motivo: "ok" }).success).toBe(false);
    expect(rechazoSchema.safeParse({ motivo: "ok" }).success).toBe(false);
  });
});

describe("cancelacionSchema", () => {
  it("exige la marca de confirmación", () => {
    expect(cancelacionSchema.parse({ id: "4", confirmar: "true" })).toEqual({ id: 4, confirmar: "true" });
  });

  it.each([undefined, null, "", "false", "TRUE", "1"])("rechaza confirmar=%j", (confirmar) => {
    expect(cancelacionSchema.safeParse({ id: "4", confirmar }).success).toBe(false);
  });
});

describe("leerParametrosDeLista", () => {
  it("sin parámetros: primera página y sin filtro", () => {
    expect(leerParametrosDeLista({})).toEqual({ pagina: 1, estado: undefined });
  });

  it("lee página y estado válidos", () => {
    expect(leerParametrosDeLista({ pagina: "3", estado: "confirmada" })).toEqual({ pagina: 3, estado: "confirmada" });
  });

  it.each(["abc", "0", "-2", "1.5", "99999999"])("pagina=%j cae a la primera", (pagina) => {
    expect(leerParametrosDeLista({ pagina }).pagina).toBe(1);
  });

  it("un estado desconocido cae a todas", () => {
    expect(leerParametrosDeLista({ estado: "xyz" }).estado).toBeUndefined();
  });

  it("un parámetro repetido toma el primero", () => {
    expect(leerParametrosDeLista({ pagina: ["2", "5"], estado: ["cancelada", "x"] })).toEqual({
      pagina: 2,
      estado: "cancelada",
    });
  });

  it("pagina=abc y estado=xyz juntos dan los valores por defecto", () => {
    expect(leerParametrosDeLista({ pagina: "abc", estado: "xyz" })).toEqual({ pagina: 1, estado: undefined });
  });
});
