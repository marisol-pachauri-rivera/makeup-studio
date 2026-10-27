import { describe, expect, it, vi } from "vitest";
import { conReintentoEnPool } from "./pool-con-reintento";

const errorDeConexion = () => Object.assign(new Error("boom"), { code: "ECONNRESET" });

async function conTemporizadoresFalsos<T>(promesa: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promesa;
}

describe("conReintentoEnPool", () => {
  it("reintenta connect sin callback", async () => {
    const cliente = { query: vi.fn() };
    const connect = vi.fn().mockRejectedValueOnce(errorDeConexion()).mockResolvedValue(cliente);
    const pool = conReintentoEnPool({ connect, query: vi.fn() });

    vi.useFakeTimers();
    try {
      await expect(conTemporizadoresFalsos(pool.connect())).resolves.toBe(cliente);
    } finally {
      vi.useRealTimers();
    }
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("reintenta una consulta suelta", async () => {
    const query = vi.fn().mockRejectedValueOnce(errorDeConexion()).mockResolvedValue({ rows: [1] });
    const pool = conReintentoEnPool({ connect: vi.fn(), query });

    vi.useFakeTimers();
    try {
      await expect(conTemporizadoresFalsos(pool.query("select 1"))).resolves.toEqual({ rows: [1] });
    } finally {
      vi.useRealTimers();
    }
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("delega sin reintento cuando se pasa callback", () => {
    const callback = () => {};
    const connect = vi.fn();
    conReintentoEnPool({ connect, query: vi.fn() }).connect(callback);
    expect(connect).toHaveBeenCalledWith(callback);
  });
});
