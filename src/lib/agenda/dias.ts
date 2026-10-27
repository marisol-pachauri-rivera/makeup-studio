/** Días en el orden en que se muestran: lunes primero. El valor del esquema es 0 = domingo. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;

export const NOMBRE_DIA: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** `HH:MM:SS` de la columna `time` a `HH:MM`. */
export const horaCorta = (hora: string) => hora.slice(0, 5);

/** Agrupa los tramos por día respetando el orden recibido dentro de cada día. */
export function agruparPorDia<T extends { diaSemana: number }>(tramos: readonly T[]): { dia: number; tramos: T[] }[] {
  return ORDEN_DIAS.map((dia) => ({ dia, tramos: tramos.filter((t) => t.diaSemana === dia) }));
}
