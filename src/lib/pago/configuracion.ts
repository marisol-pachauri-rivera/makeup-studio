export type ConfiguracionDePago = {
  /** Imagen del QR de la billetera del studio: una URL `https://` o una ruta de `public/`. */
  qrUrl: string;
  /** Nombre de la billetera, para el texto alternativo del QR y las instrucciones. */
  billetera: string;
};

export const BILLETERA_POR_DEFECTO = "la billetera del studio";
const MAX_NOMBRE_BILLETERA = 60;

type Entorno = Record<string, string | undefined>;

/** Una URL https con servidor, o una ruta absoluta del propio sitio (por ejemplo `/qr-pago.png`). */
function esUbicacionDeImagenValida(valor: string): boolean {
  if (valor.startsWith("/")) {
    // Ni `//otro-sitio` (misma URL con otro destino) ni `..` para salir de `public/`.
    return /^\/(?!\/)[A-Za-z0-9._/-]+$/.test(valor) && !valor.includes("..");
  }
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * La configuración del pago por QR del studio, o `null` si no hay un QR válido. Sin QR la página de
 * estado no ofrece el campo del número: nadie debe pagar sin saber a dónde. No hay un QR de ejemplo a
 * propósito, para que una clienta nunca pague a una cuenta que no es del studio.
 */
export function leerConfiguracionDePago(env: Entorno = process.env): ConfiguracionDePago | null {
  const qr = env.QR_PAGO_URL?.trim();
  if (!qr || !esUbicacionDeImagenValida(qr)) return null;
  const nombre = env.BILLETERA_NOMBRE?.trim().slice(0, MAX_NOMBRE_BILLETERA);
  return { qrUrl: qr, billetera: nombre || BILLETERA_POR_DEFECTO };
}
