import { z } from "zod";
import type { ResultadoCancelacion } from "./cancelar";
import { PLAZO_CANCELACION_HORAS } from "./plazo";

/** Lo que la Server Action devuelve al botón de cancelar de la página de estado. */
export type ResultadoFormulario =
  /** La reserva quedó cancelada (también si ya lo estaba por la propia clienta). */
  | { estado: "cancelada" }
  /** No se pudo cancelar: se explica con un aviso. */
  | { estado: "rechazada"; motivo: Exclude<ResultadoCancelacion["estado"], "cancelada">; mensaje: string };

export type EstadoFormulario = ResultadoFormulario | { estado: "inicial" };

const MENSAJES = {
  ya_cancelada: "Esta reserva ya estaba cancelada.",
  fuera_de_plazo: `Ya no se puede cancelar desde acá: faltan menos de ${PLAZO_CANCELACION_HORAS} horas para tu turno. Escribile al studio.`,
  no_encontrada: "No encontramos tu reserva.",
} as const;

const rechazo = (motivo: keyof typeof MENSAJES): ResultadoFormulario => ({
  estado: "rechazada",
  motivo,
  mensaje: MENSAJES[motivo],
});

/**
 * Valida el token con Zod antes de tocar la base (ADR 0006) y traduce el resultado. Un token inválido
 * se trata como reserva no encontrada, sin decir que el formato era el problema; `FormData.get` puede
 * devolver `null` o un archivo, que llegan al esquema como dato inválido.
 */
export async function procesarCancelacion(
  formData: FormData,
  deps: { cancelar: (token: string) => Promise<ResultadoCancelacion> },
): Promise<ResultadoFormulario> {
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) return rechazo("no_encontrada");

  const resultado = await deps.cancelar(token.data);
  return resultado.estado === "cancelada" ? { estado: "cancelada" } : rechazo(resultado.estado);
}
