import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn(() => "db-falsa");
const ingresarNumeroDeOperacion = vi.fn();
const cancelarReservaDeLaClienta = vi.fn();
const refresh = vi.fn();

vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/pago/ingreso", () => ({ ingresarNumeroDeOperacion }));
vi.mock("@/lib/cancelacion/cancelar", () => ({ cancelarReservaDeLaClienta }));
vi.mock("next/cache", () => ({ refresh }));

const { cancelarReserva, ingresarNumero } = await import("./actions");

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("ingresarNumero", () => {
  it("informa el pago con la base y refresca la página", async () => {
    ingresarNumeroDeOperacion.mockResolvedValue({ estado: "registrado" });

    expect(await ingresarNumero({ estado: "inicial" }, form({ token: TOKEN, numero: "op-1234" }))).toEqual({ estado: "registrado" });

    expect(ingresarNumeroDeOperacion).toHaveBeenCalledExactlyOnceWith("db-falsa", { token: TOKEN, numero: "OP-1234" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("no exige sesión: las clientas no tienen cuenta", async () => {
    ingresarNumeroDeOperacion.mockResolvedValue({ estado: "registrado" });
    await expect(ingresarNumero({ estado: "inicial" }, form({ token: TOKEN, numero: "OP-1234" }))).resolves.toMatchObject({
      estado: "registrado",
    });
  });

  it.each(["numero_usado", "vencida", "cancelada", "pago_ya_informado", "ya_confirmada", "no_encontrada"] as const)(
    "un rechazo (%s) no refresca la página",
    async (estado) => {
      ingresarNumeroDeOperacion.mockResolvedValue({ estado });
      const r = await ingresarNumero({ estado: "inicial" }, form({ token: TOKEN, numero: "OP-1234" }));
      expect(r.estado).not.toBe("registrado");
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("con un número inválido devuelve el error del campo y no toca la base ni refresca", async () => {
    const r = await ingresarNumero({ estado: "inicial" }, form({ token: TOKEN, numero: "" }));
    expect(r).toMatchObject({ estado: "invalido", errores: { numero: expect.any(String) } });
    expect(getDb).not.toHaveBeenCalled();
    expect(ingresarNumeroDeOperacion).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("con un token inválido no toca la base", async () => {
    const r = await ingresarNumero({ estado: "inicial" }, form({ token: "x", numero: "OP-1234" }));
    expect(r).toMatchObject({ estado: "rechazado", motivo: "no_encontrada" });
    expect(ingresarNumeroDeOperacion).not.toHaveBeenCalled();
  });

  it("relanza un error inesperado para que lo muestre la página de error", async () => {
    ingresarNumeroDeOperacion.mockRejectedValue(new Error("se cayó la base"));
    await expect(ingresarNumero({ estado: "inicial" }, form({ token: TOKEN, numero: "OP-1234" }))).rejects.toThrow("se cayó la base");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("cancelarReserva", () => {
  it("cancela con la base y el reloj del servidor, y refresca la página", async () => {
    cancelarReservaDeLaClienta.mockResolvedValue({ estado: "cancelada" });

    expect(await cancelarReserva({ estado: "inicial" }, form({ token: TOKEN }))).toEqual({ estado: "cancelada" });

    expect(cancelarReservaDeLaClienta).toHaveBeenCalledExactlyOnceWith("db-falsa", { token: TOKEN }, expect.any(Date));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("no exige sesión: el enlace es la credencial", async () => {
    cancelarReservaDeLaClienta.mockResolvedValue({ estado: "cancelada" });
    await expect(cancelarReserva({ estado: "inicial" }, form({ token: TOKEN }))).resolves.toMatchObject({ estado: "cancelada" });
  });

  it.each(["ya_cancelada", "fuera_de_plazo", "no_encontrada"] as const)("un rechazo (%s) no refresca la página", async (estado) => {
    cancelarReservaDeLaClienta.mockResolvedValue({ estado });
    expect(await cancelarReserva({ estado: "inicial" }, form({ token: TOKEN }))).toMatchObject({ estado: "rechazada", motivo: estado });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("con un token inválido no toca la base", async () => {
    expect(await cancelarReserva({ estado: "inicial" }, form({ token: "x" }))).toMatchObject({ estado: "rechazada", motivo: "no_encontrada" });
    expect(getDb).not.toHaveBeenCalled();
    expect(cancelarReservaDeLaClienta).not.toHaveBeenCalled();
  });

  it("relanza un error inesperado", async () => {
    cancelarReservaDeLaClienta.mockRejectedValue(new Error("se cayó la base"));
    await expect(cancelarReserva({ estado: "inicial" }, form({ token: TOKEN }))).rejects.toThrow("se cayó la base");
    expect(refresh).not.toHaveBeenCalled();
  });
});
