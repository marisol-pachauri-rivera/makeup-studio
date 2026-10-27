import { describe, expect, it } from "vitest";
import { esChoqueDeHorario, leerErrorPg } from "./errores-pg";

const pg = (code: string, constraint?: string) => Object.assign(new Error("pg"), { code, constraint });

describe("leerErrorPg", () => {
  it("lee código y restricción de un error directo", () => {
    expect(leerErrorPg(pg("23505", "reserva_clave_idempotencia_unica"))).toEqual({
      codigo: "23505",
      restriccion: "reserva_clave_idempotencia_unica",
    });
  });

  it("lo lee también cuando Drizzle lo envuelve en cause", () => {
    const envuelto = new Error("Failed query", { cause: pg("23P01", "reserva_linea_sin_solapamiento") });
    expect(leerErrorPg(envuelto)).toEqual({ codigo: "23P01", restriccion: "reserva_linea_sin_solapamiento" });
  });

  it("no busca más allá de dos niveles", () => {
    const profundo = new Error("a", { cause: new Error("b", { cause: new Error("c", { cause: pg("23P01") }) }) });
    expect(leerErrorPg(profundo)).toEqual({});
  });

  it.each([undefined, null, "texto", 42, {}, new Error("sin código")])("devuelve vacío para %j", (valor) => {
    expect(leerErrorPg(valor)).toEqual({});
  });

  it("ignora un código que no es texto", () => {
    expect(leerErrorPg({ code: 23505 })).toEqual({});
  });
});

describe("esChoqueDeHorario", () => {
  it("reconoce la exclusión (23P01)", () => {
    expect(esChoqueDeHorario(pg("23P01"))).toBe(true);
  });

  it("reconoce el bloqueo mutuo (40P01)", () => {
    expect(esChoqueDeHorario(pg("40P01"))).toBe(true);
  });

  it("los reconoce envueltos", () => {
    expect(esChoqueDeHorario(new Error("x", { cause: pg("40P01") }))).toBe(true);
    expect(esChoqueDeHorario(new Error("x", { cause: pg("23P01") }))).toBe(true);
  });

  it("no confunde una unicidad ni otros errores con un choque", () => {
    expect(esChoqueDeHorario(pg("23505"))).toBe(false);
    expect(esChoqueDeHorario(pg("23514"))).toBe(false);
    expect(esChoqueDeHorario(new Error("sin código"))).toBe(false);
    expect(esChoqueDeHorario("texto")).toBe(false);
  });
});
