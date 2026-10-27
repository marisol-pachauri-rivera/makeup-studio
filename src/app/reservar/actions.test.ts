import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn(() => "db-falsa");
const crearReservaIndividual = vi.fn();
const crearReservaGrupal = vi.fn();

vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/reserva/crear", () => ({ crearReservaIndividual }));
vi.mock("@/lib/reserva/crear-grupal", () => ({ crearReservaGrupal }));

const { confirmarReserva } = await import("./actions");

const campos = {
  clave: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
  servicioId: "4",
  maquilladoraId: "2",
  inicio: "2026-12-24T14:00:00.000Z",
  nombre: "Lucía",
  telefono: "999111222",
};

function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...campos, ...extra })) fd.set(k, v);
  return fd;
}

const integrante = (extra: Record<string, unknown> = {}) => ({
  nombre: "Ana",
  servicioId: 4,
  maquilladoraId: 2,
  inicio: "2026-12-24T14:00:00.000Z",
  ...extra,
});
const formGrupo = (personas: unknown, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("clave", campos.clave);
  fd.set("nombre", "Lucía");
  fd.set("telefono", "999111222");
  fd.set("personas", typeof personas === "string" ? personas : JSON.stringify(personas));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("confirmarReserva: reserva individual", () => {
  it("crea con la base y la hora actual y devuelve el token", async () => {
    crearReservaIndividual.mockResolvedValue({ estado: "creada", token: "tok-9", repetida: false });
    const antes = Date.now();

    expect(await confirmarReserva({ estado: "inicial" }, form())).toEqual({ estado: "ok", token: "tok-9" });

    const [db, solicitud, ahora] = crearReservaIndividual.mock.calls[0];
    expect(db).toBe("db-falsa");
    expect(solicitud).toMatchObject({ servicioId: 4, maquilladoraId: 2, nombre: "Lucía" });
    expect(ahora.getTime()).toBeGreaterThanOrEqual(antes);
    expect(crearReservaGrupal).not.toHaveBeenCalled();
  });

  it("no exige sesión: las clientas no tienen cuenta", async () => {
    crearReservaIndividual.mockResolvedValue({ estado: "creada", token: "tok-9", repetida: false });
    await expect(confirmarReserva({ estado: "inicial" }, form())).resolves.toMatchObject({ estado: "ok" });
  });

  it("traslada el choque de horario", async () => {
    crearReservaIndividual.mockResolvedValue({ estado: "horario_no_disponible" });
    expect(await confirmarReserva({ estado: "inicial" }, form())).toEqual({ estado: "horario_no_disponible" });
  });

  it("con entrada inválida devuelve los errores y no toca la base", async () => {
    const r = await confirmarReserva({ estado: "inicial" }, form({ nombre: "", telefono: "12" }));
    expect(r).toMatchObject({ estado: "invalido", errores: { nombre: expect.any(String), telefono: expect.any(String) } });
    expect(getDb).not.toHaveBeenCalled();
    expect(crearReservaIndividual).not.toHaveBeenCalled();
  });

  it("relanza un error inesperado para que lo muestre la página de error", async () => {
    crearReservaIndividual.mockRejectedValue(new Error("se cayó la base"));
    await expect(confirmarReserva({ estado: "inicial" }, form())).rejects.toThrow("se cayó la base");
  });
});

describe("confirmarReserva: reserva grupal", () => {
  it("con personas crea el grupo con la base y la hora actual, sin tocar la reserva individual", async () => {
    crearReservaGrupal.mockResolvedValue({ estado: "creada", token: "tok-g", repetida: false });
    const antes = Date.now();

    const r = await confirmarReserva({ estado: "inicial" }, formGrupo([integrante(), integrante({ nombre: "Bea" })]));

    expect(r).toEqual({ estado: "ok", token: "tok-g" });
    const [db, solicitud, ahora] = crearReservaGrupal.mock.calls[0];
    expect(db).toBe("db-falsa");
    expect(solicitud.personas).toHaveLength(2);
    expect(ahora.getTime()).toBeGreaterThanOrEqual(antes);
    expect(crearReservaIndividual).not.toHaveBeenCalled();
  });

  it("no exige sesión", async () => {
    crearReservaGrupal.mockResolvedValue({ estado: "creada", token: "tok-g", repetida: false });
    await expect(confirmarReserva({ estado: "inicial" }, formGrupo([integrante(), integrante()]))).resolves.toMatchObject({
      estado: "ok",
    });
  });

  it("traslada qué integrantes chocaron", async () => {
    crearReservaGrupal.mockResolvedValue({
      estado: "rechazada",
      noDisponibles: [],
      horariosNoDisponibles: [1],
      solapamientos: [],
    });
    expect(await confirmarReserva({ estado: "inicial" }, formGrupo([integrante(), integrante()]))).toEqual({
      estado: "grupo_rechazado",
      noDisponibles: [],
      horariosNoDisponibles: [1],
      solapamientos: [],
    });
  });

  it("con una integrante inválida devuelve el error de su ruta y no toca la base", async () => {
    const r = await confirmarReserva({ estado: "inicial" }, formGrupo([integrante(), integrante({ nombre: "" })]));
    expect(r).toMatchObject({ estado: "invalido", errores: { "personas.1.nombre": expect.any(String) } });
    expect(getDb).not.toHaveBeenCalled();
    expect(crearReservaGrupal).not.toHaveBeenCalled();
  });

  it("un JSON manipulado se rechaza sin tocar la base", async () => {
    const r = await confirmarReserva({ estado: "inicial" }, formGrupo("{esto no es json"));
    expect(r).toMatchObject({ estado: "invalido", errores: { personas: expect.any(String) } });
    expect(crearReservaGrupal).not.toHaveBeenCalled();
  });

  it("un archivo en personas se rechaza sin tocar la base", async () => {
    const fd = formGrupo([integrante(), integrante()]);
    fd.set("personas", new File(["[]"], "personas.json"));
    expect(await confirmarReserva({ estado: "inicial" }, fd)).toMatchObject({ estado: "invalido" });
    expect(crearReservaGrupal).not.toHaveBeenCalled();
  });

  it("relanza un error inesperado", async () => {
    crearReservaGrupal.mockRejectedValue(new Error("se cayó la base"));
    await expect(confirmarReserva({ estado: "inicial" }, formGrupo([integrante(), integrante()]))).rejects.toThrow(
      "se cayó la base",
    );
  });
});
