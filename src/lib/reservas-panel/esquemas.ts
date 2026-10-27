import { z } from "zod";
import { ESTADOS_RESERVA } from "@/db/schema";
import { idSchema } from "@/lib/catalogo/esquemas";

// Límite del motivo: no viene del PRD, ver design.md (decisión 6 y riesgos del cambio de #11).
export const MAX_MOTIVO_RECHAZO = 300;
export const RESERVAS_POR_PAGINA = 25;

/** Identificador de la reserva (ruta o campo oculto): entero positivo en texto. */
export const idReservaSchema = idSchema;

/** Rechazo del pago: el motivo es obligatorio, recortado y acotado. */
export const rechazoSchema = z.object({
  id: idReservaSchema,
  motivo: z
    .string({ error: "Escribí el motivo del rechazo." })
    .trim()
    .min(1, "Escribí el motivo del rechazo.")
    .max(MAX_MOTIVO_RECHAZO, `El motivo admite hasta ${MAX_MOTIVO_RECHAZO} caracteres.`),
});

/** Cancelar no se puede deshacer: la acción exige la marca de confirmación, no solo la pantalla. */
export const cancelacionSchema = z.object({
  id: idReservaSchema,
  confirmar: z.literal("true", { error: "Confirmá la cancelación para continuar." }),
});

export type DatosRechazo = z.output<typeof rechazoSchema>;
export type DatosCancelacion = z.output<typeof cancelacionSchema>;

export const CAMPOS_VALIDACION = ["id"] as const;
export const CAMPOS_RECHAZO = ["id", "motivo"] as const;
export const CAMPOS_CANCELACION = ["id", "confirmar"] as const;

export type FiltroDeEstado = (typeof ESTADOS_RESERVA)[number];

// Un parámetro repetido (`?pagina=1&pagina=2`) llega como arreglo: se toma el primero.
const primero = (valor: unknown) => (Array.isArray(valor) ? valor[0] : valor);

/**
 * Parámetros de la dirección de la lista. Cualquier valor inválido cae al por defecto (primera página,
 * sin filtro) en vez de dar error: la dirección la puede escribir cualquiera.
 */
export const parametrosDeListaSchema = z.object({
  pagina: z.preprocess(
    primero,
    z
      .string()
      .regex(/^\d{1,6}$/)
      .transform(Number)
      .refine((n) => n > 0),
  ).catch(1),
  estado: z.preprocess(primero, z.enum(ESTADOS_RESERVA).optional()).catch(undefined),
});

export type ParametrosDeLista = z.output<typeof parametrosDeListaSchema>;

export function leerParametrosDeLista(buscar: Record<string, unknown>): ParametrosDeLista {
  return parametrosDeListaSchema.parse({ pagina: buscar.pagina, estado: buscar.estado });
}
