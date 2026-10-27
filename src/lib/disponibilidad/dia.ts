import type { DiaConHuecos } from "./huecos";

/**
 * El día que se muestra: el pedido si tiene turnos libres; si no (no existe, no tiene turnos o está
 * fuera de los 30 días), el primero con disponibilidad, sin error. `undefined` si no hay ninguno.
 */
export function elegirDia(dias: readonly DiaConHuecos[], fechaPedida?: string): DiaConHuecos | undefined {
  return dias.find((d) => d.fecha === fechaPedida) ?? dias[0];
}
