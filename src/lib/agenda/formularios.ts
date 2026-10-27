import type { z } from "zod";
import { erroresPorCampo, idSchema } from "@/lib/catalogo/esquemas";
import type { EstadoFormulario } from "@/lib/catalogo/formularios";
import { bloqueoSchema, horarioSchema } from "./esquemas";
import type { DatosBloqueo, DatosHorario } from "./esquemas";
import type { ResultadoAltaHorario } from "./horarios";

/** Estado de un formulario de alta de la agenda: `exito` limpia el formulario y muestra la confirmación. */
export type EstadoAgenda = EstadoFormulario & { exito?: string };

export type ResultadoAgenda = EstadoAgenda | { noEncontrado: true };

export const CAMPOS_HORARIO = ["diaSemana", "horaInicio", "horaFin"] as const;
export const CAMPOS_BLOQUEO = ["inicio", "fin", "motivo"] as const;

export const MENSAJE_SOLAPADO = "Ese tramo se solapa con otro ya cargado ese día. Ajustá las horas o quitá el otro.";

function leerCampos(formData: FormData, campos: readonly string[]) {
  const entrada: Record<string, FormDataEntryValue | null> = {};
  for (const campo of campos) entrada[campo] = formData.get(campo);
  return entrada;
}

function comoTexto(entrada: Record<string, FormDataEntryValue | null>) {
  const valores: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(entrada)) valores[campo] = typeof valor === "string" ? valor : "";
  return valores;
}

/** Valida la maquilladora y los campos antes de llamar a `ejecutar`; en error no se escribe nada. */
async function procesarAlta<T>(
  formData: FormData,
  campos: readonly string[],
  esquema: z.ZodType<T, unknown>,
  ejecutar: (maquilladoraId: number, datos: T) => Promise<ResultadoAgenda>,
): Promise<ResultadoAgenda> {
  const maquilladoraId = idSchema.safeParse(formData.get("maquilladoraId"));
  if (!maquilladoraId.success) return { noEncontrado: true };

  const entrada = leerCampos(formData, campos);
  const datos = esquema.safeParse(entrada);
  if (!datos.success) return { valores: comoTexto(entrada), errores: erroresPorCampo(datos.error) };
  return ejecutar(maquilladoraId.data, datos.data);
}

export function procesarAltaHorario(
  formData: FormData,
  deps: { agregar: (maquilladoraId: number, datos: DatosHorario) => Promise<ResultadoAltaHorario> },
) {
  return procesarAlta(formData, CAMPOS_HORARIO, horarioSchema, async (maquilladoraId, datos) => {
    const resultado = await deps.agregar(maquilladoraId, datos);
    if (resultado.estado === "maquilladora_inexistente") return { noEncontrado: true };
    if (resultado.estado === "solapado") {
      return { valores: comoTexto(leerCampos(formData, CAMPOS_HORARIO)), mensaje: MENSAJE_SOLAPADO };
    }
    return { exito: "Tramo agregado." };
  });
}

export function procesarAltaBloqueo(
  formData: FormData,
  deps: { agregar: (maquilladoraId: number, datos: DatosBloqueo) => Promise<unknown | undefined> },
) {
  return procesarAlta(formData, CAMPOS_BLOQUEO, bloqueoSchema, async (maquilladoraId, datos) => {
    const bloqueo = await deps.agregar(maquilladoraId, datos);
    return bloqueo === undefined ? { noEncontrado: true } : { exito: "Bloqueo agregado." };
  });
}

/**
 * Baja de un tramo o bloqueo. Devuelve `false` solo si los identificadores no son válidos; que el
 * registro ya no exista no es un error (un reenvío no debe fallar).
 */
export async function procesarBaja(
  formData: FormData,
  quitar: (maquilladoraId: number, id: number) => Promise<unknown>,
): Promise<boolean> {
  const maquilladoraId = idSchema.safeParse(formData.get("maquilladoraId"));
  const id = idSchema.safeParse(formData.get("id"));
  if (!maquilladoraId.success || !id.success) return false;
  await quitar(maquilladoraId.data, id.data);
  return true;
}
