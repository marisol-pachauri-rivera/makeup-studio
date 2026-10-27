import { z } from "zod";

// Límites del catálogo: no vienen del PRD, ver design.md (decisión 2).
export const MAX_NOMBRE = 100;
export const MAX_DESCRIPCION = 500;
export const MAX_DURACION_MINUTOS = 720;

const nombre = z
  .string({ error: "El nombre es obligatorio." })
  .trim()
  .min(1, "El nombre es obligatorio.")
  .max(MAX_NOMBRE, `El nombre admite hasta ${MAX_NOMBRE} caracteres.`);

/**
 * El precio llega como texto y se queda como texto: `numeric(10,2)` es un `string` en Drizzle y
 * pasarlo por `number` perdería exactitud. Admite coma o punto decimal.
 */
const precio = z
  .string({ error: "El precio no es válido." })
  .trim()
  .regex(/^\d{1,8}(?:[.,]\d{1,2})?$/, "El precio no es válido: usá un monto de 0 o más con hasta dos decimales.")
  .transform((texto) => {
    const [enteros, decimales = ""] = texto.replace(",", ".").split(".");
    return `${Number(enteros)}.${decimales.padEnd(2, "0")}`;
  });

const duracionMinutos = z
  .string({ error: "La duración no es válida." })
  .trim()
  .regex(/^\d+$/, "La duración no es válida: usá minutos enteros.")
  .transform(Number)
  .refine((n) => n >= 1 && n <= MAX_DURACION_MINUTOS, `La duración debe estar entre 1 y ${MAX_DURACION_MINUTOS} minutos.`);

export const servicioSchema = z.object({
  nombre,
  descripcion: z
    .string()
    .trim()
    .max(MAX_DESCRIPCION, `La descripción admite hasta ${MAX_DESCRIPCION} caracteres.`)
    .optional()
    .default(""),
  precio,
  duracionMinutos,
});

export const maquilladoraSchema = z.object({ nombre });

/** Identificador de la ruta o de un campo oculto: entero positivo en texto. */
export const idSchema = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number)
  .refine((n) => n > 0);

export type DatosServicio = z.output<typeof servicioSchema>;
export type DatosMaquilladora = z.output<typeof maquilladoraSchema>;

/** Errores por campo (primer mensaje de cada uno) para mostrarlos junto al campo. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [campo, mensajes] of Object.entries(z.flattenError(error).fieldErrors)) {
    const primero = (mensajes as string[] | undefined)?.[0];
    if (primero) resultado[campo] = primero;
  }
  return resultado;
}
