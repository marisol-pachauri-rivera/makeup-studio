import { z } from "zod";

// Formato del número de operación: no viene del PRD, ver design.md (decisión 2). Cubre los códigos
// numéricos y alfanuméricos habituales de las billeteras; se ajusta aquí si el studio usa otro.
export const MIN_NUMERO_OPERACION = 4;
export const MAX_NUMERO_OPERACION = 30;

/**
 * Número de operación: recortado, obligatorio, letras, números y guiones sin espacios interiores, y
 * guardado en mayúsculas. Normalizar hace que `UNIQUE` compare lo mismo que ve el studio: "op-1" y
 * "OP-1" son el mismo número, no dos.
 */
export const numeroOperacionSchema = z
  .string({ error: "Ingresá el número de operación." })
  .trim()
  .min(1, "Ingresá el número de operación.")
  .regex(
    new RegExp(`^[A-Za-z0-9][A-Za-z0-9-]{${MIN_NUMERO_OPERACION - 1},${MAX_NUMERO_OPERACION - 1}}$`),
    `El número de operación debe tener entre ${MIN_NUMERO_OPERACION} y ${MAX_NUMERO_OPERACION} caracteres, solo letras, números y guiones, sin espacios.`,
  )
  .transform((texto) => texto.toUpperCase());

/** Lo que el servidor acepta al informar un pago: el token del enlace y el número. */
export const ingresoSchema = z.object({
  token: z.uuid({ error: "No encontramos tu reserva." }),
  numero: numeroOperacionSchema,
});

export type IngresoDeNumero = z.output<typeof ingresoSchema>;

export const CAMPOS_INGRESO = ["token", "numero"] as const;
