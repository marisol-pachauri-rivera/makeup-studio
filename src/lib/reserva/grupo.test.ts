import { describe, expect, it } from "vitest";
import { detectarSolapamientos, MAX_INTEGRANTES, MIN_INTEGRANTES, sumarPrecios } from "./grupo";

const t = (hora: string) => new Date(`2026-12-21T${hora}:00Z`);
const linea = (indice: number, maquilladoraId: number, desde: string, hasta: string) => ({
  indice,
  maquilladoraId,
  inicio: t(desde),
  fin: t(hasta),
});

describe("tamaño del grupo", () => {
  it("va de 2 a 10 integrantes", () => {
    expect(MIN_INTEGRANTES).toBe(2);
    expect(MAX_INTEGRANTES).toBe(10);
  });
});

describe("detectarSolapamientos", () => {
  it("no encuentra nada si no hay solapamientos", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:00"), linea(1, 1, "12:00", "13:00")])).toEqual([]);
  });

  it("detecta el mismo horario con la misma maquilladora", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:00"), linea(1, 1, "10:00", "11:00")])).toEqual([[0, 1]]);
  });

  it("detecta un pisado parcial", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:30"), linea(1, 1, "11:00", "12:00")])).toEqual([[0, 1]]);
  });

  it("detecta un turno contenido dentro de otro", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "13:00"), linea(1, 1, "11:00", "12:00")])).toEqual([[0, 1]]);
  });

  it("los turnos contiguos no se solapan (rangos semiabiertos)", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:00"), linea(1, 1, "11:00", "12:00")])).toEqual([]);
    expect(detectarSolapamientos([linea(0, 1, "11:00", "12:00"), linea(1, 1, "10:00", "11:00")])).toEqual([]);
  });

  it("maquilladoras distintas no se solapan aunque coincida la hora", () => {
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:00"), linea(1, 2, "10:00", "11:00")])).toEqual([]);
  });

  it("con tres integrantes informa todos los pares, sin repetir y en orden", () => {
    const pares = detectarSolapamientos([
      linea(0, 1, "10:00", "12:00"),
      linea(1, 1, "11:00", "13:00"),
      linea(2, 1, "11:30", "12:30"),
      linea(3, 2, "11:00", "12:00"),
    ]);
    expect(pares).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("usa los índices de la solicitud aunque lleguen desordenados", () => {
    expect(detectarSolapamientos([linea(5, 1, "10:00", "11:00"), linea(2, 1, "10:30", "11:30")])).toEqual([[2, 5]]);
  });

  it("devuelve vacío con una sola línea o ninguna", () => {
    expect(detectarSolapamientos([])).toEqual([]);
    expect(detectarSolapamientos([linea(0, 1, "10:00", "11:00")])).toEqual([]);
  });
});

describe("sumarPrecios", () => {
  it("suma 350.50 + 120.10 + 80.00 = 550.60 exactos", () => {
    expect(sumarPrecios(["350.50", "120.10", "80.00"])).toBe("550.60");
  });

  it("evita el error de punto flotante clásico (0.1 + 0.2)", () => {
    expect(sumarPrecios(["0.10", "0.20"])).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3); // lo que haría Number
  });

  it("acepta precios enteros y con un solo decimal", () => {
    expect(sumarPrecios(["100", "250"])).toBe("350.00");
    expect(sumarPrecios(["10.5", "0.5"])).toBe("11.00");
  });

  it("acepta precios en cero", () => {
    expect(sumarPrecios(["0.00", "0"])).toBe("0.00");
    expect(sumarPrecios(["0.00", "99.99"])).toBe("99.99");
  });

  it("devuelve 0.00 sin precios", () => {
    expect(sumarPrecios([])).toBe("0.00");
  });

  it("maneja montos grandes dentro de numeric(10,2)", () => {
    expect(sumarPrecios(["99999999.99", "0.01"])).toBe("100000000.00");
  });

  it("rechaza texto que no es un precio", () => {
    expect(() => sumarPrecios(["abc"])).toThrow("Precio inválido");
    expect(() => sumarPrecios(["-5.00"])).toThrow("Precio inválido");
    expect(() => sumarPrecios(["1.234"])).toThrow("Precio inválido");
  });
});
