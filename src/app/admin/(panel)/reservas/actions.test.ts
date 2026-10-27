import { beforeEach, describe, expect, it, vi } from "vitest";

class NoAutorizado extends Error {}

const requerirAdmin = vi.fn();
const getDb = vi.fn(() => "db-falsa");
const transiciones = {
  validarReserva: vi.fn(),
  rechazarReserva: vi.fn(),
  cancelarReserva: vi.fn(),
};
const refresh = vi.fn();

vi.mock("@/lib/auth/sesion", () => ({ requerirAdmin }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/reservas-panel/transiciones", () => transiciones);
vi.mock("next/cache", () => ({ refresh }));

const { cancelarReserva, rechazarPago, validarPago } = await import("./actions");

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const inicial = { estado: "inicial" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  requerirAdmin.mockResolvedValue({ id: 1, usuario: "maria" });
});

describe("sin sesión válida ninguna acción toca la base", () => {
  beforeEach(() => {
    requerirAdmin.mockRejectedValue(new NoAutorizado());
  });

  it.each([
    ["validarPago", () => validarPago(inicial, form({ id: "1" }))],
    ["rechazarPago", () => rechazarPago(inicial, form({ id: "1", motivo: "no aparece" }))],
    ["cancelarReserva", () => cancelarReserva(inicial, form({ id: "1", confirmar: "true" }))],
  ])("%s se rechaza como no autorizada", async (_nombre, invocar) => {
    await expect(invocar()).rejects.toBeInstanceOf(NoAutorizado);
    expect(getDb).not.toHaveBeenCalled();
    expect(transiciones.validarReserva).not.toHaveBeenCalled();
    expect(transiciones.rechazarReserva).not.toHaveBeenCalled();
    expect(transiciones.cancelarReserva).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("una entrada inválida no llega a la base", () => {
  it("validar con un id no numérico", async () => {
    expect(await validarPago(inicial, form({ id: "abc" }))).toMatchObject({ estado: "aviso" });
    expect(transiciones.validarReserva).not.toHaveBeenCalled();
  });

  it("rechazar con el motivo vacío devuelve el error junto al campo", async () => {
    expect(await rechazarPago(inicial, form({ id: "4", motivo: "  " }))).toMatchObject({
      estado: "invalido",
      errores: { motivo: expect.any(String) },
    });
    expect(transiciones.rechazarReserva).not.toHaveBeenCalled();
  });

  it("cancelar sin confirmación", async () => {
    expect(await cancelarReserva(inicial, form({ id: "4" }))).toMatchObject({ estado: "aviso" });
    expect(transiciones.cancelarReserva).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("éxito", () => {
  it("validar aplica con la base real y refresca", async () => {
    transiciones.validarReserva.mockResolvedValue({ estado: "aplicada" });
    expect(await validarPago(inicial, form({ id: "4" }))).toEqual({ estado: "aplicada" });
    expect(transiciones.validarReserva).toHaveBeenCalledWith("db-falsa", 4);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rechazar aplica con el motivo recortado y refresca", async () => {
    transiciones.rechazarReserva.mockResolvedValue({ estado: "aplicada" });
    expect(await rechazarPago(inicial, form({ id: "4", motivo: " no aparece " }))).toEqual({ estado: "aplicada" });
    expect(transiciones.rechazarReserva).toHaveBeenCalledWith("db-falsa", 4, "no aparece");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancelar con confirmación aplica y refresca", async () => {
    transiciones.cancelarReserva.mockResolvedValue({ estado: "aplicada" });
    expect(await cancelarReserva(inicial, form({ id: "4", confirmar: "true" }))).toEqual({ estado: "aplicada" });
    expect(transiciones.cancelarReserva).toHaveBeenCalledWith("db-falsa", 4);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("la reserva cambió de estado", () => {
  it("avisa del estado actual y no refresca", async () => {
    transiciones.validarReserva.mockResolvedValue({ estado: "estado_distinto", actual: "cancelada" });
    const r = await validarPago(inicial, form({ id: "4" }));
    expect(r).toMatchObject({ estado: "aviso" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

it("un error inesperado de la base se relanza", async () => {
  transiciones.validarReserva.mockRejectedValue(new Error("la base se cayó"));
  await expect(validarPago(inicial, form({ id: "4" }))).rejects.toThrow("la base se cayó");
  expect(refresh).not.toHaveBeenCalled();
});
