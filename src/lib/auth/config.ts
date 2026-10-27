/** Vigencia máxima de la sesión (8 h) sin renovación por actividad. */
export const DURACION_SESION_SEGUNDOS = 8 * 60 * 60;

export function leerAuthSecret(env: Record<string, string | undefined> = process.env): string {
  const secreto = env.AUTH_SECRET;
  if (!secreto) {
    throw new Error("Falta la variable de entorno AUTH_SECRET (generala con `npx auth secret`).");
  }
  return secreto;
}
