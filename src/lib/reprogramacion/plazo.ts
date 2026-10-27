import { PLAZO_CANCELACION_HORAS, puedeCancelar } from "@/lib/cancelacion/plazo";

/**
 * Reprogramar exige la misma anticipación que cancelar (PRD): una sola constante, la de
 * `@/lib/cancelacion/plazo`, para que las dos reglas no se separen nunca.
 */
export const ANTICIPACION_MINIMA_HORAS = PLAZO_CANCELACION_HORAS;

/** Se mide sobre el inicio del turno ORIGINAL: con 24 horas exactas se puede, con 23 h 59 min no. */
export function puedeReprogramarse(inicio: Date, ahora: Date): boolean {
  return puedeCancelar(inicio, ahora);
}
