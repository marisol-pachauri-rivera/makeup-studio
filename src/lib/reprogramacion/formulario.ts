import { z } from "zod";
import { idSchema } from "@/lib/catalogo/esquemas";
import { ANTICIPACION_MINIMA_HORAS } from "./plazo";
import type { ResultadoReprogramacion, SolicitudReprogramacion } from "./reprogramar";

/** Lo que la Server Action devuelve a la pantalla de reprogramación. */
export type ResultadoFormulario =
  /** El turno quedó en el horario nuevo (también si ya lo estaba): la pantalla vuelve a la página de estado. */
  | { estado: "reprogramada"; token: string }
  /** No se pudo reprogramar: se explica con un aviso y el turno original no cambia. */
  | { estado: "rechazada"; motivo: Exclude<ResultadoReprogramacion["estado"], "reprogramada">; mensaje: string };

export type EstadoFormulario = ResultadoFormulario | { estado: "inicial" };

export const CAMPOS_REPROGRAMACION = [
  "token",
  "lineaId",
  "maquilladoraId",
  "inicio",
  "inicioVisto",
  "maquilladoraVistaId",
] as const;

const instante = z.iso.datetime({ error: "No encontramos tu reserva." }).transform((texto) => new Date(texto));

/** Lo que el servidor acepta al reprogramar: todo viene del formulario, nada se confía a la pantalla. */
export const reprogramacionSchema = z.object({
  token: z.uuid({ error: "No encontramos tu reserva." }),
  lineaId: idSchema,
  maquilladoraId: idSchema,
  inicio: instante,
  inicioVisto: instante,
  maquilladoraVistaId: idSchema,
});

export const MENSAJES = {
  horario_no_disponible: "Ese horario ya no está disponible. Elegí otro: tu turno original sigue igual.",
  fuera_de_plazo: `Ya no se puede reprogramar desde acá: faltan menos de ${ANTICIPACION_MINIMA_HORAS} horas para tu turno. Escribile al studio.`,
  no_reprogramable: "Este turno ya no se puede reprogramar.",
  turno_cambiado: "Tu turno cambió desde que abriste esta pantalla. Recargá la página para verlo actualizado.",
  no_encontrada: "No encontramos tu reserva.",
  maquilladora_no_disponible: "Esa maquilladora ya no está disponible. Elegí otra.",
} as const;

const rechazo = (motivo: keyof typeof MENSAJES): ResultadoFormulario => ({
  estado: "rechazada",
  motivo,
  mensaje: MENSAJES[motivo],
});

/**
 * Valida con Zod antes de tocar la base (ADR 0006) y traduce el resultado. Una entrada inválida (token mal
 * formado, ids o instantes que no son lo que deben, campos ausentes o archivos) se trata como reserva no
 * encontrada, sin decir cuál era el problema.
 */
export async function procesarReprogramacion(
  formData: FormData,
  deps: { reprogramar: (solicitud: SolicitudReprogramacion) => Promise<ResultadoReprogramacion> },
): Promise<ResultadoFormulario> {
  const entrada: Record<string, FormDataEntryValue | null> = {};
  for (const campo of CAMPOS_REPROGRAMACION) entrada[campo] = formData.get(campo);

  const datos = reprogramacionSchema.safeParse(entrada);
  if (!datos.success) return rechazo("no_encontrada");

  const resultado = await deps.reprogramar(datos.data);
  return resultado.estado === "reprogramada" ? { estado: "reprogramada", token: datos.data.token } : rechazo(resultado.estado);
}
