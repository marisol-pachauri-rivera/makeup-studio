import { REINTENTO } from "./config";
import { ErrorAccesoDatos } from "./errors";

const CODIGOS_RED = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"]);
const SQLSTATE_NO_DISPONIBLE = new Set(["57P01", "57P03"]);
const MENSAJES_CONEXION = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /connection (?:closed|refused|reset)/i,
];

export function esErrorDeConexion(error: unknown, nivel = 0): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message, cause } = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (typeof code === "string") {
    if (CODIGOS_RED.has(code) || SQLSTATE_NO_DISPONIBLE.has(code) || code.startsWith("08")) {
      return true;
    }
  }
  if (typeof message === "string" && MENSAJES_CONEXION.some((re) => re.test(message))) {
    return true;
  }
  return nivel < 1 && cause !== undefined && esErrorDeConexion(cause, nivel + 1);
}

export interface OpcionesReintento {
  intentos?: number;
  esperasMs?: readonly number[];
  esperar?: (ms: number) => Promise<void>;
  registrar?: (mensaje: string, causa: unknown) => void;
}

const esperarReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const registrarEnServidor = (mensaje: string, causa: unknown) => console.error(mensaje, causa);

export async function conReintento<T>(
  operacion: () => Promise<T>,
  {
    intentos = REINTENTO.intentos,
    esperasMs = REINTENTO.esperasMs,
    esperar = esperarReal,
    registrar = registrarEnServidor,
  }: OpcionesReintento = {},
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await operacion();
    } catch (error) {
      if (!esErrorDeConexion(error)) throw error;
      if (intento >= intentos) {
        registrar(`Acceso a datos: se agotaron ${intentos} intentos`, error);
        throw new ErrorAccesoDatos({ cause: error });
      }
      await esperar(esperasMs[Math.min(intento - 1, esperasMs.length - 1)] ?? 0);
    }
  }
}
