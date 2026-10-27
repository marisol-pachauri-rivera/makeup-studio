import { describe, expect, it } from "vitest";
import { ingresoSchema, MAX_NUMERO_OPERACION, MIN_NUMERO_OPERACION, numeroOperacionSchema } from "./esquemas";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";
const mensaje = (valor: unknown) => {
  const r = numeroOperacionSchema.safeParse(valor);
  return r.success ? null : r.error.issues[0].message;
};

describe("numeroOperacionSchema", () => {
  it("acepta un número válido y lo pasa a mayúsculas", () => {
    expect(numeroOperacionSchema.parse("op-123456")).toBe("OP-123456");
  });

  it("recorta los espacios alrededor", () => {
    expect(numeroOperacionSchema.parse(" ab12cd34 ")).toBe("AB12CD34");
  });

  it("acepta solo dígitos", () => {
    expect(numeroOperacionSchema.parse("00123456")).toBe("00123456");
  });

  it("normaliza igual lo que solo difiere en mayúsculas", () => {
    expect(numeroOperacionSchema.parse("abc-1")).toBe(numeroOperacionSchema.parse("ABC-1"));
  });

  it.each(["", "   ", "\t"])("el vacío o solo espacios pide ingresar el número (%j)", (valor) => {
    expect(mensaje(valor)).toBe("Ingresá el número de operación.");
  });

  it.each([undefined, null, 5])("un valor que no es texto (%j) pide ingresar el número", (valor) => {
    expect(mensaje(valor)).toBe("Ingresá el número de operación.");
  });

  it("acepta desde 4 y hasta 30 caracteres", () => {
    expect(mensaje("a".repeat(MIN_NUMERO_OPERACION))).toBeNull();
    expect(mensaje("a".repeat(MAX_NUMERO_OPERACION))).toBeNull();
  });

  it("rechaza 3 y 31 caracteres con el mensaje de formato", () => {
    expect(mensaje("a".repeat(MIN_NUMERO_OPERACION - 1))).toMatch(/entre 4 y 30 caracteres/);
    expect(mensaje("a".repeat(MAX_NUMERO_OPERACION + 1))).toMatch(/entre 4 y 30 caracteres/);
  });

  it.each(["1234 5678", "12 34", "12_345", "12.345", "12/345", "#12345", "12345!", "número1", "１２３４５"])(
    "rechaza %j",
    (valor) => {
      expect(mensaje(valor)).toMatch(/solo letras, números y guiones, sin espacios/);
    },
  );

  it("no puede empezar con un guion", () => {
    expect(mensaje("-1234")).not.toBeNull();
    expect(mensaje("1234-")).toBeNull();
  });
});

describe("ingresoSchema", () => {
  it("acepta un token y un número válidos", () => {
    expect(ingresoSchema.parse({ token: TOKEN, numero: "ab-1234" })).toEqual({ token: TOKEN, numero: "AB-1234" });
  });

  it("rechaza un token que no es uuid señalando el campo token", () => {
    const r = ingresoSchema.safeParse({ token: "abc", numero: "AB-1234" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["token"]);
    expect(r.error?.issues[0].message).toBe("No encontramos tu reserva.");
  });

  it("señala el campo numero cuando el número es inválido", () => {
    const r = ingresoSchema.safeParse({ token: TOKEN, numero: "1" });
    expect(r.error?.issues[0].path).toEqual(["numero"]);
  });

  it("rechaza campos ausentes", () => {
    expect(ingresoSchema.safeParse({}).success).toBe(false);
  });
});
