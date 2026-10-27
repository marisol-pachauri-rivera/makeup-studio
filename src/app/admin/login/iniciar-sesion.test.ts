import { describe, expect, it, vi } from "vitest";
import { MENSAJE_CREDENCIALES_INVALIDAS, mensajeDeBloqueo, procesarInicioSesion } from "./iniciar-sesion";

const AHORA = new Date("2026-01-10T12:00:00Z");

function deps(retorno = "/admin") {
  return {
    signIn: vi.fn().mockResolvedValue(retorno),
    consultarLimite: vi.fn().mockResolvedValue({ bloqueado: false }),
    ahora: () => AHORA,
  };
}

const entrada = { usuario: "maria", password: "clave", callbackUrl: "/admin/reservas" };

describe("procesarInicioSesion", () => {
  it.each([
    [{ ...entrada, usuario: "" }, "usuario", "Ingresá tu usuario."],
    [{ ...entrada, usuario: "   " }, "usuario", "Ingresá tu usuario."],
    [{ ...entrada, password: "" }, "password", "Ingresá tu contraseña."],
    [{ ...entrada, usuario: null }, "usuario", "Ingresá tu usuario."],
    [{ ...entrada, password: null }, "password", "Ingresá tu contraseña."],
  ])("con campos inválidos (%j) indica cuál falta y no llama a signIn", async (datos, campo, mensaje) => {
    const d = deps();
    const resultado = await procesarInicioSesion(datos, d);
    expect(resultado).toMatchObject({ errores: { [campo]: mensaje } });
    expect(d.signIn).not.toHaveBeenCalled();
    expect(d.consultarLimite).not.toHaveBeenCalled();
  });

  it("conserva el usuario escrito pero nunca devuelve la contraseña", async () => {
    const resultado = await procesarInicioSesion({ ...entrada, password: "" }, deps());
    expect(resultado).toMatchObject({ usuario: "maria" });
    expect(JSON.stringify(resultado)).not.toContain("clave");
  });

  it("con credenciales correctas pide redirigir al destino pedido del panel", async () => {
    const d = deps("/admin/reservas");
    expect(await procesarInicioSesion(entrada, d)).toEqual({ redirigirA: "/admin/reservas" });
    expect(d.signIn).toHaveBeenCalledWith({ usuario: "maria", password: "clave", redirectTo: "/admin/reservas" });
  });

  it("un destino externo se reemplaza por el panel", async () => {
    const d = deps();
    expect(await procesarInicioSesion({ ...entrada, callbackUrl: "https://evil.com" }, d)).toEqual({
      redirigirA: "/admin",
    });
    expect(d.signIn).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: "/admin" }));
  });

  it("con credenciales inválidas muestra un mensaje genérico", async () => {
    const d = deps("/admin/login?error=CredentialsSignin&code=credentials");
    expect(await procesarInicioSesion(entrada, d)).toEqual({
      usuario: "maria",
      mensaje: MENSAJE_CREDENCIALES_INVALIDAS,
    });
    expect(d.consultarLimite).not.toHaveBeenCalled();
  });

  it("si el límite bloquea, avisa cuánto esperar", async () => {
    const d = deps("/admin/login?error=CredentialsSignin&code=bloqueado");
    d.consultarLimite.mockResolvedValue({ bloqueado: true, reintentarEn: new Date(AHORA.getTime() + 7 * 60_000) });
    expect(await procesarInicioSesion(entrada, d)).toEqual({
      usuario: "maria",
      mensaje: "Demasiados intentos fallidos. Probá de nuevo en 7 minutos.",
    });
    expect(d.consultarLimite).toHaveBeenCalledWith("maria");
  });

  it("consulta el límite con el usuario normalizado", async () => {
    const d = deps("/admin/login?error=CredentialsSignin&code=bloqueado");
    await procesarInicioSesion({ ...entrada, usuario: "  María " }, d);
    expect(d.consultarLimite).toHaveBeenCalledWith("maría");
  });
});

describe("mensajeDeBloqueo", () => {
  it("redondea hacia arriba y usa el singular a partir de un minuto", () => {
    const en = (ms: number) => ({ bloqueado: true as const, reintentarEn: new Date(AHORA.getTime() + ms) });
    expect(mensajeDeBloqueo(en(30_000), AHORA)).toContain("en 1 minuto.");
    expect(mensajeDeBloqueo(en(61_000), AHORA)).toContain("en 2 minutos.");
    expect(mensajeDeBloqueo(en(-5_000), AHORA)).toContain("en 1 minuto.");
  });
});
