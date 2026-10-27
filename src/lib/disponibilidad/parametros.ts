import { idSchema } from "@/lib/catalogo/esquemas";
import { sumarDias } from "./fechas";

export type ParametrosDisponibilidad = {
  maquilladoraId?: number;
  /** Fecha `YYYY-MM-DD` que existe en el calendario. */
  fecha?: string;
};

type Crudo = string | string[] | undefined;

/** Un parámetro repetido (`?maquilladora=1&maquilladora=2`) es ambiguo: se trata como ausente. */
const unico = (valor: Crudo) => (typeof valor === "string" ? valor : undefined);

function fechaValida(texto: string | undefined): string | undefined {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined;
  // `2026-02-30` se normaliza a `2026-03-02`: si la ida y vuelta cambia, la fecha no existe.
  return sumarDias(texto, 0) === texto ? texto : undefined;
}

/**
 * Lee `maquilladora` y `fecha` de la URL. Nunca lanza: un valor inválido equivale a no haberlo
 * mandado, porque cualquiera puede escribir lo que quiera en la barra de direcciones.
 */
export function leerParametros(crudos: { maquilladora?: Crudo; fecha?: Crudo }): ParametrosDisponibilidad {
  const id = idSchema.safeParse(unico(crudos.maquilladora));
  return {
    maquilladoraId: id.success ? id.data : undefined,
    fecha: fechaValida(unico(crudos.fecha)),
  };
}
