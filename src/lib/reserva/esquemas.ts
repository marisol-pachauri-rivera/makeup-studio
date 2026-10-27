import { z } from "zod";
import { idSchema } from "@/lib/catalogo/esquemas";
import { MAX_INTEGRANTES, MIN_INTEGRANTES } from "./grupo";

// Límites del contacto: no vienen del PRD, ver design.md (decisión 3).
export const MAX_NOMBRE = 100;
export const MIN_DIGITOS_TELEFONO = 7;
export const MAX_DIGITOS_TELEFONO = 15;

export const nombreSchema = z
  .string({ error: "El nombre es obligatorio." })
  .trim()
  .min(1, "El nombre es obligatorio.")
  .max(MAX_NOMBRE, `El nombre admite hasta ${MAX_NOMBRE} caracteres.`);

/** Dígitos, espacios, guiones, paréntesis y un `+` inicial; entre 7 y 15 dígitos en total. */
export const telefonoSchema = z
  .string({ error: "El teléfono es obligatorio." })
  .trim()
  .min(1, "El teléfono es obligatorio.")
  .regex(/^\+?[\d\s().-]+$/, "El teléfono solo puede tener números, espacios, guiones y paréntesis.")
  .refine(
    (texto) => {
      const digitos = texto.replace(/\D/g, "").length;
      return digitos >= MIN_DIGITOS_TELEFONO && digitos <= MAX_DIGITOS_TELEFONO;
    },
    `El teléfono debe tener entre ${MIN_DIGITOS_TELEFONO} y ${MAX_DIGITOS_TELEFONO} dígitos.`,
  );

/** Lo que el servidor acepta al confirmar. Los identificadores llegan como texto de un campo oculto. */
export const solicitudReservaSchema = z.object({
  clave: z.uuid({ error: "La solicitud no es válida. Volvé a elegir el horario." }),
  servicioId: idSchema,
  maquilladoraId: idSchema,
  inicio: z.iso
    .datetime({ error: "El horario no es válido. Volvé a elegirlo." })
    .transform((texto) => new Date(texto)),
  nombre: nombreSchema,
  telefono: telefonoSchema,
});

export type SolicitudReserva = z.output<typeof solicitudReservaSchema>;

export const CAMPOS_SOLICITUD = ["clave", "servicioId", "maquilladoraId", "inicio", "nombre", "telefono"] as const;

// --- Reserva grupal ------------------------------------------------------------------------------

const idEntero = (mensaje: string) => z.number({ error: mensaje }).int(mensaje).positive(mensaje);

/** Una integrante: su propio nombre, servicio, maquilladora y horario. Viaja dentro del JSON de `personas`. */
export const integranteSchema = z.object({
  nombre: nombreSchema,
  servicioId: idEntero("Falta elegir el servicio."),
  maquilladoraId: idEntero("Falta elegir la maquilladora."),
  inicio: z.iso
    .datetime({ error: "Falta elegir el horario." })
    .transform((texto) => new Date(texto)),
});

export type Integrante = z.output<typeof integranteSchema>;

/** Lo que el servidor acepta al confirmar un grupo. El contacto es el de quien reserva. */
export const solicitudGrupalSchema = z.object({
  clave: z.uuid({ error: "La solicitud no es válida. Volvé a elegir los horarios." }),
  nombre: nombreSchema,
  telefono: telefonoSchema,
  personas: z
    .array(integranteSchema, { error: "La lista de integrantes no es válida." })
    .min(MIN_INTEGRANTES, `Un grupo necesita al menos ${MIN_INTEGRANTES} integrantes: una reserva de una persona es individual.`)
    .max(MAX_INTEGRANTES, `Un grupo admite hasta ${MAX_INTEGRANTES} integrantes.`),
});

export type SolicitudGrupal = z.output<typeof solicitudGrupalSchema>;

export const CAMPOS_GRUPO = ["clave", "nombre", "telefono", "personas"] as const;

/**
 * Lee el campo oculto `personas` (JSON). Un JSON roto, vacío o que no sea texto no lanza: devuelve
 * `undefined`, y el esquema lo rechaza como lista inválida. Cualquiera puede escribir lo que quiera.
 */
export function leerPersonas(valor: FormDataEntryValue | null): unknown {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  try {
    return JSON.parse(valor);
  } catch {
    return undefined;
  }
}

/**
 * Primer mensaje de cada ruta de error (`personas.2.nombre`), a diferencia de `erroresPorCampo`, que
 * solo aplana el primer nivel y perdería a qué integrante corresponde cada error.
 */
export function erroresPorRuta(error: z.ZodError): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const { path, message } of error.issues) {
    const ruta = path.join(".");
    if (!(ruta in resultado)) resultado[ruta] = message;
  }
  return resultado;
}
