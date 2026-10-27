import { describe, expect, it } from "vitest";
import { destinoTrasLogin, esDestinoDelPanel, esRutaDeLogin, tieneCookieDeSesion, urlDeLogin } from "./rutas";

describe("destinoTrasLogin", () => {
  it.each(["/admin", "/admin/", "/admin/reservas", "/admin/reservas?dia=2026-01-10", "/admin#x"])(
    "acepta la ruta del panel %s",
    (ruta) => {
      expect(destinoTrasLogin(ruta)).toBe(ruta);
    },
  );

  it.each([
    "https://evil.com",
    "//evil.com",
    "//evil.com/admin",
    "/\evil.com",
    "/administrador",
    "/adminx/otra",
    "/",
    "/reservas",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("redirige al panel ante un destino que no es del panel (%j)", (valor) => {
    expect(destinoTrasLogin(valor)).toBe("/admin");
    expect(esDestinoDelPanel(valor)).toBe(false);
  });
});

describe("urlDeLogin", () => {
  it("recuerda la ruta pedida, con su query, codificada", () => {
    expect(urlDeLogin("/admin/reservas", "?dia=2026-01-10")).toBe(
      "/admin/login?callbackUrl=%2Fadmin%2Freservas%3Fdia%3D2026-01-10",
    );
  });

  it("no recuerda el panel raíz, que ya es el destino por defecto", () => {
    expect(urlDeLogin("/admin")).toBe("/admin/login");
  });
});

describe("esRutaDeLogin", () => {
  it.each([["/admin/login", true], ["/admin/login/", true], ["/admin/loginx", false], ["/admin", false]])(
    "%s → %s",
    (ruta, esperado) => {
      expect(esRutaDeLogin(ruta)).toBe(esperado);
    },
  );
});

describe("tieneCookieDeSesion", () => {
  it("reconoce la cookie en HTTP, en HTTPS y partida en fragmentos", () => {
    expect(tieneCookieDeSesion(["authjs.session-token"])).toBe(true);
    expect(tieneCookieDeSesion(["x", "__Secure-authjs.session-token"])).toBe(true);
    expect(tieneCookieDeSesion(["authjs.session-token.0", "authjs.session-token.1"])).toBe(true);
  });

  it("no confunde otras cookies de Auth.js con la sesión", () => {
    expect(tieneCookieDeSesion([])).toBe(false);
    expect(tieneCookieDeSesion(["authjs.csrf-token", "authjs.callback-url"])).toBe(false);
    expect(tieneCookieDeSesion(["authjs.session-tokenx"])).toBe(false);
  });
});
