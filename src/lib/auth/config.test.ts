import { describe, expect, it } from "vitest";
import { DURACION_SESION_SEGUNDOS, leerAuthSecret } from "./config";

describe("leerAuthSecret", () => {
  it("devuelve el secreto cuando está definido", () => {
    expect(leerAuthSecret({ AUTH_SECRET: "abc" })).toBe("abc");
  });

  it.each([[{}], [{ AUTH_SECRET: "" }]])("falla con un mensaje claro si falta (%j)", (env) => {
    expect(() => leerAuthSecret(env)).toThrow(/AUTH_SECRET/);
  });
});

describe("DURACION_SESION_SEGUNDOS", () => {
  it("es de 8 horas", () => {
    expect(DURACION_SESION_SEGUNDOS).toBe(28_800);
  });
});
