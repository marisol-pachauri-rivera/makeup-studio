import { describe, expect, it } from "vitest";
import { erroresPorCampo, idSchema, maquilladoraSchema, servicioSchema } from "./esquemas";

const valido = { nombre: "Maquillaje social", descripcion: "", precio: "350", duracionMinutos: "60" };

describe("servicioSchema", () => {
  it("acepta un servicio válido y normaliza precio y duración", () => {
    expect(servicioSchema.parse(valido)).toEqual({
      nombre: "Maquillaje social",
      descripcion: "",
      precio: "350.00",
      duracionMinutos: 60,
    });
  });

  it.each([
    ["350", "350.00"],
    ["350,50", "350.50"],
    ["350.5", "350.50"],
    ["0", "0.00"],
    ["007", "7.00"],
    ["99999999.99", "99999999.99"],
  ])("normaliza el precio %s a %s", (entrada, esperado) => {
    expect(servicioSchema.parse({ ...valido, precio: entrada }).precio).toBe(esperado);
  });

  it.each(["350.505", "-1", "1e3", "", "  ", "abc", "1,2,3", "Infinity", "123456789", ".5", "5."])(
    "rechaza el precio %j",
    (entrada) => {
      const r = servicioSchema.safeParse({ ...valido, precio: entrada });
      expect(r.success).toBe(false);
      if (!r.success) expect(erroresPorCampo(r.error).precio).toMatch(/precio/i);
    },
  );

  it.each([
    ["1", 1],
    ["60", 60],
    ["720", 720],
  ])("acepta la duración %s", (entrada, esperado) => {
    expect(servicioSchema.parse({ ...valido, duracionMinutos: entrada }).duracionMinutos).toBe(esperado);
  });

  it.each(["0", "-5", "721", "1.5", "", "abc", "1e2"])("rechaza la duración %j", (entrada) => {
    const r = servicioSchema.safeParse({ ...valido, duracionMinutos: entrada });
    expect(r.success).toBe(false);
    if (!r.success) expect(erroresPorCampo(r.error).duracionMinutos).toMatch(/duración/i);
  });

  it("rechaza un nombre vacío o solo con espacios", () => {
    for (const nombre of ["", "   "]) {
      const r = servicioSchema.safeParse({ ...valido, nombre });
      expect(r.success).toBe(false);
      if (!r.success) expect(erroresPorCampo(r.error).nombre).toBe("El nombre es obligatorio.");
    }
  });

  it("recorta los espacios del nombre y de la descripción", () => {
    const r = servicioSchema.parse({ ...valido, nombre: "  Peinado ", descripcion: "  con ondas " });
    expect(r.nombre).toBe("Peinado");
    expect(r.descripcion).toBe("con ondas");
  });

  it("limita el nombre a 100 y la descripción a 500 caracteres", () => {
    expect(servicioSchema.safeParse({ ...valido, nombre: "a".repeat(100) }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...valido, nombre: "a".repeat(101) }).success).toBe(false);
    expect(servicioSchema.safeParse({ ...valido, descripcion: "a".repeat(500) }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...valido, descripcion: "a".repeat(501) }).success).toBe(false);
  });

  it("guarda la descripción vacía cuando se omite", () => {
    const sinDescripcion = { nombre: valido.nombre, precio: valido.precio, duracionMinutos: valido.duracionMinutos };
    expect(servicioSchema.parse(sinDescripcion).descripcion).toBe("");
  });

  it("rechaza campos ausentes o de tipo inválido (FormData.get devuelve null)", () => {
    const r = servicioSchema.safeParse({ nombre: null, descripcion: null, precio: null, duracionMinutos: null });
    expect(r.success).toBe(false);
  });
});

describe("maquilladoraSchema", () => {
  it("acepta un nombre y lo recorta", () => {
    expect(maquilladoraSchema.parse({ nombre: "  Lucía " })).toEqual({ nombre: "Lucía" });
  });

  it("rechaza un nombre vacío, ausente o de más de 100 caracteres", () => {
    expect(maquilladoraSchema.safeParse({ nombre: "  " }).success).toBe(false);
    expect(maquilladoraSchema.safeParse({ nombre: null }).success).toBe(false);
    const r = maquilladoraSchema.safeParse({ nombre: "a".repeat(101) });
    expect(r.success).toBe(false);
    if (!r.success) expect(erroresPorCampo(r.error).nombre).toMatch(/100/);
  });
});

describe("idSchema", () => {
  it("acepta enteros positivos en texto", () => {
    expect(idSchema.parse("7")).toBe(7);
  });

  it.each(["0", "abc", "-1", "1.5", "", " 7", "1234567890", null, undefined, 7])("rechaza %j", (entrada) => {
    expect(idSchema.safeParse(entrada).success).toBe(false);
  });
});
