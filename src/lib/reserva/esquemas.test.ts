import { describe, expect, it } from "vitest";
import { erroresPorRuta, leerPersonas, MAX_NOMBRE, solicitudGrupalSchema, solicitudReservaSchema } from "./esquemas";

const valida = {
  clave: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
  servicioId: "4",
  maquilladoraId: "2",
  inicio: "2026-12-24T14:00:00.000Z",
  nombre: "Lucía Pérez",
  telefono: "999111222",
};

const campoConError = (cambio: Partial<Record<keyof typeof valida, unknown>>) => {
  const r = solicitudReservaSchema.safeParse({ ...valida, ...cambio });
  return r.success ? null : r.error.issues[0].path[0];
};

describe("solicitudReservaSchema", () => {
  it("acepta una solicitud válida y convierte identificadores e instante", () => {
    const datos = solicitudReservaSchema.parse(valida);
    expect(datos).toMatchObject({ servicioId: 4, maquilladoraId: 2, nombre: "Lucía Pérez", telefono: "999111222" });
    expect(datos.inicio).toBeInstanceOf(Date);
    expect(datos.inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
  });

  it("recorta el nombre y el teléfono", () => {
    const datos = solicitudReservaSchema.parse({ ...valida, nombre: "  Ana  ", telefono: "  999111222 " });
    expect(datos.nombre).toBe("Ana");
    expect(datos.telefono).toBe("999111222");
  });

  describe("nombre", () => {
    it.each(["", "   "])("rechaza el nombre vacío %j", (nombre) => {
      expect(campoConError({ nombre })).toBe("nombre");
    });

    it("acepta 100 caracteres y rechaza 101", () => {
      expect(campoConError({ nombre: "a".repeat(MAX_NOMBRE) })).toBeNull();
      expect(campoConError({ nombre: "a".repeat(MAX_NOMBRE + 1) })).toBe("nombre");
    });

    it("rechaza un campo ausente", () => {
      expect(campoConError({ nombre: undefined })).toBe("nombre");
    });
  });

  describe("teléfono", () => {
    it.each(["+51 999 111 222", "(01) 555-1234", "999-111-222", "1234567", "123456789012345"])("acepta %j", (telefono) => {
      expect(campoConError({ telefono })).toBeNull();
    });

    it.each(["abc123456789", "99911122a", "999*111*222", "12-34", "123456", "1234567890123456", "+", ""])(
      "rechaza %j",
      (telefono) => {
        expect(campoConError({ telefono })).toBe("telefono");
      },
    );

    it("el + solo vale al inicio", () => {
      expect(campoConError({ telefono: "999+111222" })).toBe("telefono");
    });
  });

  describe("identificadores y horario", () => {
    it("rechaza una clave que no es uuid", () => {
      expect(campoConError({ clave: "no-es-uuid" })).toBe("clave");
      expect(campoConError({ clave: "" })).toBe("clave");
    });

    it.each(["abc", "0", "-1", "1.5", "", "1e3"])("rechaza el identificador de servicio %j", (servicioId) => {
      expect(campoConError({ servicioId })).toBe("servicioId");
    });

    it("rechaza el identificador de maquilladora con texto", () => {
      expect(campoConError({ maquilladoraId: "abc" })).toBe("maquilladoraId");
    });

    it.each(["", "mañana", "2026-02-30T10:00:00.000Z", "2026-12-24", "2026-12-24T14:00:00", "24/12/2026"])(
      "rechaza el instante %j",
      (inicio) => {
        expect(campoConError({ inicio })).toBe("inicio");
      },
    );

    it("acepta un instante sin milisegundos", () => {
      expect(campoConError({ inicio: "2026-12-24T14:00:00Z" })).toBeNull();
    });
  });
});

// --- Reserva grupal ------------------------------------------------------------------------------

const integrante = (extra: Record<string, unknown> = {}) => ({
  nombre: "Ana",
  servicioId: 4,
  maquilladoraId: 2,
  inicio: "2026-12-24T14:00:00.000Z",
  ...extra,
});

const grupoValido = {
  clave: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
  nombre: "Lucía Pérez",
  telefono: "999111222",
  personas: [integrante({ nombre: "Ana" }), integrante({ nombre: "Bea", maquilladoraId: 3 })],
};

const rutasConError = (cambio: Record<string, unknown>) => {
  const r = solicitudGrupalSchema.safeParse({ ...grupoValido, ...cambio });
  return r.success ? null : erroresPorRuta(r.error);
};

describe("solicitudGrupalSchema", () => {
  it("acepta un grupo válido y convierte el horario de cada integrante", () => {
    const datos = solicitudGrupalSchema.parse(grupoValido);
    expect(datos.nombre).toBe("Lucía Pérez");
    expect(datos.personas).toHaveLength(2);
    expect(datos.personas[1]).toMatchObject({ nombre: "Bea", servicioId: 4, maquilladoraId: 3 });
    expect(datos.personas[0].inicio).toBeInstanceOf(Date);
    expect(datos.personas[0].inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
  });

  it("acepta 2 y 10 integrantes y rechaza 1 y 11", () => {
    const n = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => integrante({ nombre: `P${i}` }));
    expect(rutasConError({ personas: n(2) })).toBeNull();
    expect(rutasConError({ personas: n(10) })).toBeNull();
    expect(rutasConError({ personas: n(1) })).toMatchObject({ personas: expect.stringContaining("individual") });
    expect(rutasConError({ personas: n(11) })).toMatchObject({ personas: expect.stringContaining("hasta 10") });
    expect(rutasConError({ personas: [] })).toHaveProperty("personas");
  });

  it("señala la ruta exacta de una integrante sin nombre", () => {
    const errores = rutasConError({ personas: [integrante(), integrante({ nombre: "   " })] });
    expect(errores).toEqual({ "personas.1.nombre": "El nombre es obligatorio." });
  });

  it("acepta 100 caracteres de nombre y rechaza 101", () => {
    expect(rutasConError({ personas: [integrante({ nombre: "a".repeat(100) }), integrante()] })).toBeNull();
    expect(rutasConError({ personas: [integrante(), integrante({ nombre: "a".repeat(101) })] })).toHaveProperty(
      "personas.1.nombre",
    );
  });

  it("señala a la integrante a la que le falta servicio, maquilladora u horario", () => {
    expect(rutasConError({ personas: [integrante({ servicioId: undefined }), integrante()] })).toEqual({
      "personas.0.servicioId": "Falta elegir el servicio.",
    });
    expect(rutasConError({ personas: [integrante(), integrante({ maquilladoraId: null })] })).toHaveProperty(
      "personas.1.maquilladoraId",
    );
    expect(rutasConError({ personas: [integrante({ inicio: undefined }), integrante()] })).toEqual({
      "personas.0.inicio": "Falta elegir el horario.",
    });
  });

  it.each([0, -1, 1.5, "4"])("rechaza el identificador de servicio %j", (servicioId) => {
    expect(rutasConError({ personas: [integrante({ servicioId }), integrante()] })).toHaveProperty("personas.0.servicioId");
  });

  it.each(["mañana", "2026-02-30T10:00:00.000Z", "2026-12-24", ""])("rechaza el horario %j", (inicio) => {
    expect(rutasConError({ personas: [integrante({ inicio }), integrante()] })).toHaveProperty("personas.0.inicio");
  });

  it("acumula los errores de varias integrantes", () => {
    const errores = rutasConError({
      personas: [integrante({ nombre: "" }), integrante({ inicio: undefined }), integrante({ servicioId: 0 })],
    });
    expect(Object.keys(errores ?? {}).sort()).toEqual(["personas.0.nombre", "personas.1.inicio", "personas.2.servicioId"]);
  });

  it.each([undefined, null, "texto", 42, {}, { 0: integrante() }])("rechaza personas = %j", (personas) => {
    expect(rutasConError({ personas })).toEqual({ personas: "La lista de integrantes no es válida." });
  });

  it("valida el contacto de quien reserva con las reglas de la reserva individual", () => {
    expect(rutasConError({ nombre: "" })).toEqual({ nombre: "El nombre es obligatorio." });
    expect(rutasConError({ telefono: "abc" })).toHaveProperty("telefono");
    expect(rutasConError({ telefono: "12" })).toHaveProperty("telefono");
    expect(rutasConError({ telefono: "+51 999 111 222" })).toBeNull();
  });

  it("rechaza una clave que no es uuid", () => {
    expect(rutasConError({ clave: "x" })).toHaveProperty("clave");
  });
});

describe("leerPersonas", () => {
  it("interpreta un JSON válido", () => {
    expect(leerPersonas(JSON.stringify([integrante()]))).toEqual([integrante()]);
  });

  it.each(["{no es json", "[", "", "   ", "undefined"])("devuelve undefined, sin lanzar, con %j", (crudo) => {
    expect(() => leerPersonas(crudo)).not.toThrow();
    expect(leerPersonas(crudo)).toBeUndefined();
  });

  it("devuelve undefined si falta o si es un archivo", () => {
    expect(leerPersonas(null)).toBeUndefined();
    expect(leerPersonas(new File(["[]"], "personas.json"))).toBeUndefined();
  });

  it("deja pasar un JSON que no es un arreglo para que el esquema lo rechace", () => {
    expect(leerPersonas('{"a":1}')).toEqual({ a: 1 });
    expect(leerPersonas("42")).toBe(42);
    expect(rutasConError({ personas: leerPersonas('{"a":1}') })).toHaveProperty("personas");
  });
});

describe("erroresPorRuta", () => {
  it("conserva el primer mensaje de cada ruta, con la ruta completa", () => {
    const r = solicitudGrupalSchema.safeParse({
      ...grupoValido,
      personas: [integrante({ nombre: "" }), integrante({ nombre: "" })],
    });
    if (r.success) throw new Error("error esperado");
    expect(erroresPorRuta(r.error)).toEqual({
      "personas.0.nombre": "El nombre es obligatorio.",
      "personas.1.nombre": "El nombre es obligatorio.",
    });
  });
});
