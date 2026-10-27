import { erroresPorCampo } from "@/lib/catalogo/esquemas";
import {
  CAMPOS_CANCELACION,
  CAMPOS_RECHAZO,
  CAMPOS_VALIDACION,
  cancelacionSchema,
  idReservaSchema,
  rechazoSchema,
} from "./esquemas";
import type { ResultadoTransicion } from "./transiciones";

type Estado = "pendiente_pago" | "pendiente_validacion" | "confirmada" | "cancelada";

/** Lo que la Server Action devuelve al formulario de una acción del panel. */
export type ResultadoAccion =
  /** La transición se aplicó: la pantalla se refresca y muestra el estado nuevo. */
  | { estado: "aplicada" }
  /** Error junto al campo (motivo vacío o demasiado largo, cancelación sin confirmar) y lo escrito. */
  | { estado: "invalido"; errores: Record<string, string>; valores: Record<string, string> }
  /** La reserva ya no admite la acción (cambió de estado, ya estaba aplicada o no existe): un aviso. */
  | { estado: "aviso"; mensaje: string };

export type EstadoFormulario = ResultadoAccion | { estado: "inicial" };

type Accion = "validar" | "rechazar" | "cancelar";

const TEXTO_DE_ESTADO: Record<Estado, string> = {
  pendiente_pago: "pendiente de pago",
  pendiente_validacion: "pendiente de validación",
  confirmada: "confirmada",
  cancelada: "cancelada",
};

const YA_APLICADA: Record<Accion, string> = {
  validar: "Esta reserva ya estaba confirmada.",
  rechazar: "Esta reserva ya había sido devuelta a pendiente de pago.",
  cancelar: "Esta reserva ya estaba cancelada.",
};

export const MENSAJE_NO_ENCONTRADA = "No encontramos la reserva.";

const aviso = (mensaje: string): ResultadoAccion => ({ estado: "aviso", mensaje });

/** Traduce el resultado de una transición a lo que muestra la pantalla; `invalido` lo arma cada acción. */
function traducir(accion: Accion, resultado: ResultadoTransicion): ResultadoAccion {
  switch (resultado.estado) {
    case "aplicada":
      return { estado: "aplicada" };
    case "ya_aplicada":
      return aviso(YA_APLICADA[accion]);
    case "no_encontrada":
      return aviso(MENSAJE_NO_ENCONTRADA);
    case "estado_distinto":
      return aviso(
        `La reserva cambió mientras tanto: ahora está ${TEXTO_DE_ESTADO[resultado.actual]}. No se aplicó la acción.`,
      );
  }
}

/** `FormData.get` puede devolver `null` o un archivo; ambos llegan al esquema como dato inválido. */
function leerCampos(formData: FormData, campos: readonly string[]) {
  const entrada: Record<string, FormDataEntryValue | null> = {};
  for (const campo of campos) entrada[campo] = formData.get(campo);
  return entrada;
}

/**
 * Validar el pago. Un identificador inválido o ausente se trata como reserva no encontrada, sin tocar
 * la base (ADR 0006: se valida con Zod antes de escribir).
 */
export async function procesarValidacion(
  formData: FormData,
  deps: { validar: (id: number) => Promise<ResultadoTransicion> },
): Promise<ResultadoAccion> {
  const id = idReservaSchema.safeParse(leerCampos(formData, CAMPOS_VALIDACION).id);
  if (!id.success) return aviso(MENSAJE_NO_ENCONTRADA);
  return traducir("validar", await deps.validar(id.data));
}

/** Rechazar el pago con un motivo obligatorio. El error del motivo vuelve junto al campo, con lo escrito. */
export async function procesarRechazo(
  formData: FormData,
  deps: { rechazar: (id: number, motivo: string) => Promise<ResultadoTransicion> },
): Promise<ResultadoAccion> {
  const entrada = leerCampos(formData, CAMPOS_RECHAZO);
  const datos = rechazoSchema.safeParse(entrada);
  if (!datos.success) {
    const errores = erroresPorCampo(datos.error);
    if (errores.id) return aviso(MENSAJE_NO_ENCONTRADA);
    return { estado: "invalido", errores, valores: { motivo: typeof entrada.motivo === "string" ? entrada.motivo : "" } };
  }
  return traducir("rechazar", await deps.rechazar(datos.data.id, datos.data.motivo));
}

/** Cancelar desde el panel: sin la marca de confirmación no se cancela, aunque la pantalla se haya saltado. */
export async function procesarCancelacion(
  formData: FormData,
  deps: { cancelar: (id: number) => Promise<ResultadoTransicion> },
): Promise<ResultadoAccion> {
  const datos = cancelacionSchema.safeParse(leerCampos(formData, CAMPOS_CANCELACION));
  if (!datos.success) {
    const errores = erroresPorCampo(datos.error);
    if (errores.id) return aviso(MENSAJE_NO_ENCONTRADA);
    return aviso(errores.confirmar ?? "Confirmá la cancelación para continuar.");
  }
  return traducir("cancelar", await deps.cancelar(datos.data.id));
}
