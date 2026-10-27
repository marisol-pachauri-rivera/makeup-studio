import { beforeEach, describe, expect, it, vi } from "vitest";

class NoAutorizado extends Error {}

const requerirAdmin = vi.fn();
const getDb = vi.fn(() => "db-falsa");
const horarios = { agregarHorario: vi.fn(), quitarHorario: vi.fn() };
const bloqueos = { agregarBloqueo: vi.fn(), quitarBloqueo: vi.fn() };
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
const refresh = vi.fn();

vi.mock("@/lib/auth/sesion", () => ({ requerirAdmin }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/agenda/horarios", () => horarios);
vi.mock("@/lib/agenda/bloqueos", () => bloqueos);
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/cache", () => ({ refresh }));

const { agregarBloqueo, agregarHorario, quitarBloqueo, quitarHorario } = await import("./actions");

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const horario = { maquilladoraId: "3", diaSemana: "1", horaInicio: "09:00", horaFin: "18:00" };
const bloqueo = { maquilladoraId: "3", inicio: "2026-12-24T09:00", fin: "2026-12-26T09:00", motivo: "Vacaciones" };

beforeEach(() => {
  vi.clearAllMocks();
  requerirAdmin.mockResolvedValue({ id: 1, usuario: "maria" });
});

describe("sin sesión válida ninguna acción toca la base", () => {
  beforeEach(() => {
    requerirAdmin.mockRejectedValue(new NoAutorizado());
  });

  it.each([
    ["agregarHorario", () => agregarHorario({}, form(horario))],
    ["quitarHorario", () => quitarHorario(form({ maquilladoraId: "3", id: "1" }))],
    ["agregarBloqueo", () => agregarBloqueo({}, form(bloqueo))],
    ["quitarBloqueo", () => quitarBloqueo(form({ maquilladoraId: "3", id: "1" }))],
  ])("%s se rechaza como no autorizada", async (_nombre, invocar) => {
    await expect(invocar()).rejects.toBeInstanceOf(NoAutorizado);
    expect(getDb).not.toHaveBeenCalled();
    expect(horarios.agregarHorario).not.toHaveBeenCalled();
    expect(horarios.quitarHorario).not.toHaveBeenCalled();
    expect(bloqueos.agregarBloqueo).not.toHaveBeenCalled();
    expect(bloqueos.quitarBloqueo).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("agregarHorario", () => {
  it("con datos válidos agrega, refresca y devuelve la confirmación", async () => {
    horarios.agregarHorario.mockResolvedValue({ estado: "creado", horario: {} });
    expect(await agregarHorario({}, form(horario))).toEqual({ exito: "Tramo agregado." });
    expect(horarios.agregarHorario).toHaveBeenCalledWith("db-falsa", 3, { diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("con datos inválidos devuelve errores y lo escrito, sin escribir ni refrescar", async () => {
    const estado = await agregarHorario({}, form({ ...horario, horaFin: "08:00" }));
    expect(estado).toMatchObject({ errores: { horaFin: expect.any(String) }, valores: { horaFin: "08:00" } });
    expect(horarios.agregarHorario).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("con un tramo solapado devuelve el mensaje y no refresca", async () => {
    horarios.agregarHorario.mockResolvedValue({ estado: "solapado" });
    expect(await agregarHorario({}, form(horario))).toMatchObject({ mensaje: expect.stringContaining("solapa") });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("responde no encontrado si la maquilladora no existe", async () => {
    horarios.agregarHorario.mockResolvedValue({ estado: "maquilladora_inexistente" });
    await expect(agregarHorario({}, form(horario))).rejects.toThrow("NOT_FOUND");
  });
});

describe("quitarHorario", () => {
  it("quita con la maquilladora y el id, y refresca", async () => {
    horarios.quitarHorario.mockResolvedValue(true);
    await quitarHorario(form({ maquilladoraId: "3", id: "7" }));
    expect(horarios.quitarHorario).toHaveBeenCalledWith("db-falsa", 3, 7);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("no falla si el tramo ya no existe", async () => {
    horarios.quitarHorario.mockResolvedValue(false);
    await expect(quitarHorario(form({ maquilladoraId: "3", id: "7" }))).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("responde no encontrado con identificadores inválidos y no borra", async () => {
    await expect(quitarHorario(form({ maquilladoraId: "3", id: "x" }))).rejects.toThrow("NOT_FOUND");
    expect(horarios.quitarHorario).not.toHaveBeenCalled();
  });
});

describe("agregarBloqueo", () => {
  it("con datos válidos agrega con la hora local convertida y refresca", async () => {
    bloqueos.agregarBloqueo.mockResolvedValue({ id: 1 });
    expect(await agregarBloqueo({}, form(bloqueo))).toEqual({ exito: "Bloqueo agregado." });
    const [db, id, datos] = bloqueos.agregarBloqueo.mock.calls[0];
    expect([db, id]).toEqual(["db-falsa", 3]);
    expect(datos.inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("con motivo vacío devuelve el error y lo escrito, sin escribir", async () => {
    const estado = await agregarBloqueo({}, form({ ...bloqueo, motivo: "" }));
    expect(estado).toMatchObject({ errores: { motivo: expect.any(String) }, valores: { inicio: bloqueo.inicio } });
    expect(bloqueos.agregarBloqueo).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("responde no encontrado si la maquilladora no existe", async () => {
    bloqueos.agregarBloqueo.mockResolvedValue(undefined);
    await expect(agregarBloqueo({}, form(bloqueo))).rejects.toThrow("NOT_FOUND");
  });
});

describe("quitarBloqueo", () => {
  it("quita con la maquilladora y el id, y refresca", async () => {
    bloqueos.quitarBloqueo.mockResolvedValue(true);
    await quitarBloqueo(form({ maquilladoraId: "3", id: "7" }));
    expect(bloqueos.quitarBloqueo).toHaveBeenCalledWith("db-falsa", 3, 7);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("no falla si el bloqueo ya no existe", async () => {
    bloqueos.quitarBloqueo.mockResolvedValue(false);
    await expect(quitarBloqueo(form({ maquilladoraId: "3", id: "7" }))).resolves.toBeUndefined();
  });

  it("responde no encontrado con identificadores inválidos y no borra", async () => {
    await expect(quitarBloqueo(form({ id: "7" }))).rejects.toThrow("NOT_FOUND");
    expect(bloqueos.quitarBloqueo).not.toHaveBeenCalled();
  });
});
