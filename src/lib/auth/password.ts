import bcrypt from "bcryptjs";

/** Costo de bcrypt (design.md, decisión 2); subirlo solo encarece cada intento de login. */
export const COSTO_BCRYPT = 12;

export function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

export function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let senuelo: Promise<string> | undefined;

/** Hash de relleno del mismo costo que los reales; se calcula una sola vez por proceso. */
function hashSenuelo(): Promise<string> {
  return (senuelo ??= bcrypt.hash("senuelo-que-nadie-conoce", COSTO_BCRYPT));
}

/**
 * Verifica contra `hash`, o contra un señuelo si el usuario no existe, para que el tiempo de
 * respuesta no delate qué usuarios existen. Un usuario inexistente nunca verifica.
 */
export async function verificarOSimular(password: string, hash: string | undefined): Promise<boolean> {
  const coincide = await bcrypt.compare(password, hash ?? (await hashSenuelo()));
  return hash !== undefined && coincide;
}
