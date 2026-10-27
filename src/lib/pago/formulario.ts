import { erroresPorCampo } from "@/lib/catalogo/esquemas";
import { PLAZO_VENCIMIENTO_MINUTOS } from "@/lib/reserva/vencimiento";
import { CAMPOS_INGRESO, ingresoSchema, type IngresoDeNumero } from "./esquemas";
import type { ResultadoIngreso } from "./ingreso";

/** Por qué no se pudo informar el pago, cuando no es un error del campo. */
export type MotivoDeRechazo = "vencida" | "cancelada" | "pago_ya_informado" | "ya_confirmada" | "no_encontrada";

/** Lo que la Server Action devuelve al formulario del número de operación. */
export type ResultadoFormulario =
  | { estado: "registrado" }
  /** Error junto al campo (formato, vacío, número ya usado) y lo que la clienta escribió. */
  | { estado: "invalido"; errores: Record<string, string>; valores: Record<string, string> }
  /** La reserva ya no admite el pago: se explica con un aviso, no junto al campo. */
  | { estado: "rechazado"; motivo: MotivoDeRechazo; mensaje: string };

export type EstadoFormulario = ResultadoFormulario | { estado: "inicial" };

export const MENSAJE_NUMERO_USADO =
  "Ese número de operación ya fue usado en otra reserva. Revisá que esté bien escrito.";

const MENSAJES: Record<MotivoDeRechazo, string> = {
  vencida: `Tu reserva venció: pasaron ${PLAZO_VENCIMIENTO_MINUTOS} minutos sin pago y otra clienta tomó el horario. Elegí otro horario.`,
  cancelada: "Esta reserva fue cancelada, así que ya no se puede informar un pago.",
  pago_ya_informado: "Ya informaste el pago de esta reserva con otro número. El studio lo está revisando.",
  ya_confirmada: "Esta reserva ya está confirmada.",
  no_encontrada: "No encontramos tu reserva.",
};

const rechazo = (motivo: MotivoDeRechazo): ResultadoFormulario => ({ estado: "rechazado", motivo, mensaje: MENSAJES[motivo] });

/**
 * Valida con Zod antes de tocar la base (ADR 0006) y traduce el resultado del ingreso a lo que muestra el
 * formulario. `FormData.get` puede devolver `null` o un archivo: ambos llegan al esquema como dato
 * inválido. Un token inválido se trata como reserva no encontrada, sin decir que el formato era el problema.
 */
export async function procesarIngreso(
  formData: FormData,
  deps: { ingresar: (ingreso: IngresoDeNumero) => Promise<ResultadoIngreso> },
): Promise<ResultadoFormulario> {
  const entrada: Record<string, FormDataEntryValue | null> = {};
  for (const campo of CAMPOS_INGRESO) entrada[campo] = formData.get(campo);

  const datos = ingresoSchema.safeParse(entrada);
  if (!datos.success) {
    const errores = erroresPorCampo(datos.error);
    if (errores.token) return rechazo("no_encontrada");
    const escrito = typeof entrada.numero === "string" ? entrada.numero : "";
    return { estado: "invalido", errores, valores: { numero: escrito } };
  }

  const resultado = await deps.ingresar(datos.data);
  switch (resultado.estado) {
    case "registrado":
      return { estado: "registrado" };
    case "numero_usado":
      return { estado: "invalido", errores: { numero: MENSAJE_NUMERO_USADO }, valores: { numero: String(entrada.numero) } };
    default:
      return rechazo(resultado.estado);
  }
}
