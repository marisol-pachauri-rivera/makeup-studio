import { describe, expect, it } from "vitest";
import { COSTO_BCRYPT, hashearPassword, verificarOSimular, verificarPassword } from "./password";

describe("password", () => {
  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hashearPassword("una-clave-larga-123");
    expect(await verificarPassword("una-clave-larga-123", hash)).toBe(true);
    expect(await verificarPassword("otra-clave", hash)).toBe(false);
  });

  it("produce un hash distinto en cada llamada, con el costo configurado y sin la clave en claro", async () => {
    const [a, b] = await Promise.all([hashearPassword("misma-clave-123"), hashearPassword("misma-clave-123")]);
    expect(a).not.toBe(b);
    expect(a.split("$").slice(0, 3)).toEqual(["", expect.stringMatching(/^2[aby]$/), String(COSTO_BCRYPT)]);
    expect(a).not.toContain("misma-clave-123");
  });

  it("un usuario inexistente nunca verifica, aunque se pruebe cualquier clave", async () => {
    expect(await verificarOSimular("lo-que-sea", undefined)).toBe(false);
    expect(await verificarOSimular("senuelo-que-nadie-conoce", undefined)).toBe(false);
  });

  it("verifica contra el hash real cuando el usuario existe", async () => {
    const hash = await hashearPassword("clave-real-12345");
    expect(await verificarOSimular("clave-real-12345", hash)).toBe(true);
    expect(await verificarOSimular("clave-falsa", hash)).toBe(false);
  });

  it("tarda lo mismo del mismo orden con usuario inexistente que con uno existente", async () => {
    const hash = await hashearPassword("clave-real-12345");
    await verificarOSimular("x", undefined); // calienta el señuelo

    const medir = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    const existente = await medir(() => verificarOSimular("clave-falsa", hash));
    const inexistente = await medir(() => verificarOSimular("clave-falsa", undefined));

    expect(inexistente).toBeGreaterThan(existente / 3);
    expect(inexistente).toBeLessThan(existente * 3);
  }, 30_000);
});
