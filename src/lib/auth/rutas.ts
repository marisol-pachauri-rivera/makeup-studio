export const RUTA_LOGIN = "/admin/login";
export const RUTA_PANEL = "/admin";

/** Cookies de sesión de Auth.js: la segunda es la que usa en HTTPS. Si el JWT es grande se parte en `.0`, `.1`… */
const COOKIES_DE_SESION = ["authjs.session-token", "__Secure-authjs.session-token"];

export function tieneCookieDeSesion(nombres: string[]): boolean {
  return nombres.some((n) => COOKIES_DE_SESION.some((c) => n === c || n.startsWith(`${c}.`)));
}

/** Solo rutas internas del panel: nunca una URL externa ni una ruta ajena a `/admin`. */
export function esDestinoDelPanel(valor: string | null | undefined): valor is string {
  if (!valor || !/^\/admin(?:[/?#]|$)/.test(valor)) return false;
  try {
    return new URL(valor, "http://panel.local").origin === "http://panel.local";
  } catch {
    return false;
  }
}

/** Destino posterior al login: el pedido si es del panel; si no, el panel. */
export function destinoTrasLogin(valor: string | null | undefined): string {
  return esDestinoDelPanel(valor) ? valor : RUTA_PANEL;
}

export function esRutaDeLogin(pathname: string): boolean {
  return pathname === RUTA_LOGIN || pathname.startsWith(`${RUTA_LOGIN}/`);
}

/** URL del login que recuerda a dónde volver; el login es la única ruta del panel sin sesión. */
export function urlDeLogin(pathname: string, search = ""): string {
  const pedido = `${pathname}${search}`;
  return esDestinoDelPanel(pedido) && pedido !== RUTA_PANEL
    ? `${RUTA_LOGIN}?callbackUrl=${encodeURIComponent(pedido)}`
    : RUTA_LOGIN;
}
