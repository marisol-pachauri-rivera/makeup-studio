/** Tamaño del grupo: supuesto aprobado, no viene del PRD (ver design.md de la reserva grupal). */
export const MIN_INTEGRANTES = 2;
export const MAX_INTEGRANTES = 10;

export type LineaParaSolapar = {
  /** Posición de la integrante en el arreglo `personas` que envió la clienta. */
  indice: number;
  maquilladoraId: number;
  inicio: Date;
  fin: Date;
};

/**
 * Pares de integrantes que tendrían a la misma maquilladora en rangos que se pisan. Los rangos son
 * semiabiertos (como la exclusión de Postgres): un turno que empieza justo cuando otro termina no se
 * solapa. Detectarlo aquí da un error claro antes de tocar la base, en lugar de esperar a que la
 * restricción aborte la transacción. Cada par sale una vez, con el índice menor primero.
 */
export function detectarSolapamientos(lineas: readonly LineaParaSolapar[]): [number, number][] {
  const pares: [number, number][] = [];
  for (let i = 0; i < lineas.length; i++) {
    for (let j = i + 1; j < lineas.length; j++) {
      const a = lineas[i];
      const b = lineas[j];
      const seSolapan =
        a.maquilladoraId === b.maquilladoraId &&
        a.inicio.getTime() < b.fin.getTime() &&
        a.fin.getTime() > b.inicio.getTime();
      if (seSolapan) pares.push([Math.min(a.indice, b.indice), Math.max(a.indice, b.indice)]);
    }
  }
  return pares.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/** `"350.50"` o `"350"` a centavos enteros. Los precios llegan como texto de `numeric(10,2)`. */
function aCentavos(precio: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(precio.trim());
  if (!m) throw new Error(`Precio inválido: ${precio}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/**
 * Suma exacta de precios con dos decimales, sin punto flotante: se pasa a centavos enteros, se suma
 * y se vuelve a texto con dos decimales (`"550.60"`).
 */
export function sumarPrecios(precios: readonly string[]): string {
  const centavos = precios.reduce((total, precio) => total + aCentavos(precio), 0);
  return `${Math.trunc(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}
