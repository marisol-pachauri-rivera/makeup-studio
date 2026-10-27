import { describe, expect, it, vi } from "vitest";
import { REINTENTO } from "./config";
import { ErrorAccesoDatos } from "./errors";
import { conReintento, esErrorDeConexion } from "./retry";

const errorDeConexion = () => Object.assign(new Error("boom"), { code: "ECONNRESET" });
const opciones = () => ({ esperar: vi.fn<(ms: number) => Promise<void>>(async () => {}), registrar: vi.fn() });

describe("esErrorDeConexion", () => {
  it.each([
    [{ code: "ECONNREFUSED" }],
    [{ code: "ETIMEDOUT" }],
    [{ code: "08006" }],
    [{ code: "57P03" }],
    [{ message: "Connection terminated unexpectedly" }],
    [{ message: "timeout exceeded when trying to connect" }],
    [{ message: "wrapper", cause: { code: "ECONNRESET" } }],
  ])("reconoce %o como transitorio", (error) => {
    expect(esErrorDeConexion(error)).toBe(true);
  });

  it.each([
    [{ code: "23P01" }],
    [{ code: "23505" }],
    [{ code: "42601" }],
    [new Error("otra cosa")],
    ["texto"],
    [null],
  ])("no reconoce %o como transitorio", (error) => {
    expect(esErrorDeConexion(error)).toBe(false);
  });
});

describe("conReintento", () => {
  it("devuelve el resultado si un reintento posterior tiene éxito", async () => {
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(errorDeConexion())
      .mockRejectedValueOnce(errorDeConexion())
      .mockResolvedValue("ok");
    const o = opciones();

    await expect(conReintento(operacion, o)).resolves.toBe("ok");
    expect(operacion).toHaveBeenCalledTimes(3);
    expect(o.esperar.mock.calls.map(([ms]) => ms)).toEqual([300, 600]);
    expect(o.registrar).not.toHaveBeenCalled();
  });

  it("deja de reintentar al agotar el máximo de intentos y propaga un error de acceso a datos", async () => {
    const operacion = vi.fn<() => Promise<never>>().mockRejectedValue(errorDeConexion());
    const o = opciones();

    const error = await conReintento(operacion, o).catch((e) => e);

    expect(error).toBeInstanceOf(ErrorAccesoDatos);
    expect(operacion).toHaveBeenCalledTimes(REINTENTO.intentos);
    expect(o.esperar).toHaveBeenCalledTimes(REINTENTO.intentos - 1);
  });

  it("no reintenta una violación de restricción", async () => {
    const violacion = Object.assign(new Error("exclusion_violation"), { code: "23P01" });
    const operacion = vi.fn<() => Promise<never>>().mockRejectedValue(violacion);
    const o = opciones();

    await expect(conReintento(operacion, o)).rejects.toBe(violacion);
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(o.esperar).not.toHaveBeenCalled();
  });

  it("no expone detalle técnico en el error final y lo registra en el servidor", async () => {
    const secreto = Object.assign(new Error("postgres://user:secreta@host/db"), {
      code: "ECONNRESET",
    });
    const o = opciones();

    const error = (await conReintento(() => Promise.reject(secreto), o).catch(
      (e) => e,
    )) as ErrorAccesoDatos;

    expect(error.message).not.toContain("secreta");
    expect(error.message).not.toContain("postgres://");
    expect(o.registrar).toHaveBeenCalledWith(expect.any(String), secreto);
  });
});
