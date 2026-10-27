import type { z } from "zod";
import { erroresPorCampo, idSchema, maquilladoraSchema, servicioSchema } from "./esquemas";
import type { DatosMaquilladora, DatosServicio } from "./esquemas";

/** Lo que la Server Action devuelve al formulario: errores por campo y lo que se había escrito. */
export type EstadoFormulario = {
  valores?: Record<string, string>;
  errores?: Record<string, string>;
  mensaje?: string;
};

export type ResultadoFormulario = EstadoFormulario | { redirigirA: string } | { noEncontrado: true };

export const CAMPOS_SERVICIO = ["nombre", "descripcion", "precio", "duracionMinutos"] as const;
export const CAMPOS_MAQUILLADORA = ["nombre"] as const;

/** `FormData.get` puede devolver `null` o un archivo; ambos llegan al esquema como dato inválido. */
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

/**
 * Valida con Zod antes de tocar la base. `ejecutar` devuelve `false` si el registro no existe.
 * En error de validación no se escribe nada y se devuelve lo escrito para repoblar el formulario.
 */
async function procesar<T>(
  formData: FormData,
  campos: readonly string[],
  esquema: z.ZodType<T, unknown>,
  ejecutar: (datos: T) => Promise<boolean>,
  destino: string,
): Promise<ResultadoFormulario> {
  const entrada = leerCampos(formData, campos);
  const datos = esquema.safeParse(entrada);
  if (!datos.success) return { valores: comoTexto(entrada), errores: erroresPorCampo(datos.error) };
  return (await ejecutar(datos.data)) ? { redirigirA: destino } : { noEncontrado: true };
}

type DepsServicio = {
  crear: (datos: DatosServicio) => Promise<unknown>;
  actualizar: (id: number, datos: DatosServicio) => Promise<unknown | undefined>;
};

type DepsMaquilladora = {
  crear: (datos: DatosMaquilladora) => Promise<unknown>;
  actualizar: (id: number, datos: DatosMaquilladora) => Promise<unknown | undefined>;
};

export const DESTINO_SERVICIOS = "/admin/servicios";
export const DESTINO_MAQUILLADORAS = "/admin/maquilladoras";

export function procesarAltaServicio(formData: FormData, deps: Pick<DepsServicio, "crear">) {
  return procesar(
    formData,
    CAMPOS_SERVICIO,
    servicioSchema,
    async (datos) => {
      await deps.crear(datos);
      return true;
    },
    DESTINO_SERVICIOS,
  );
}

export async function procesarEdicionServicio(formData: FormData, deps: Pick<DepsServicio, "actualizar">) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { noEncontrado: true } as const;
  return procesar(
    formData,
    CAMPOS_SERVICIO,
    servicioSchema,
    async (datos) => (await deps.actualizar(id.data, datos)) !== undefined,
    DESTINO_SERVICIOS,
  );
}

export function procesarAltaMaquilladora(formData: FormData, deps: Pick<DepsMaquilladora, "crear">) {
  return procesar(
    formData,
    CAMPOS_MAQUILLADORA,
    maquilladoraSchema,
    async (datos) => {
      await deps.crear(datos);
      return true;
    },
    DESTINO_MAQUILLADORAS,
  );
}

export async function procesarEdicionMaquilladora(formData: FormData, deps: Pick<DepsMaquilladora, "actualizar">) {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { noEncontrado: true } as const;
  return procesar(
    formData,
    CAMPOS_MAQUILLADORA,
    maquilladoraSchema,
    async (datos) => (await deps.actualizar(id.data, datos)) !== undefined,
    DESTINO_MAQUILLADORAS,
  );
}

/**
 * Activar o desactivar: el formulario manda el estado destino (`activo=true|false`), no un alternar.
 * Devuelve `false` si el id o el estado no son válidos, o si el registro no existe.
 */
export async function procesarCambioDeEstado(
  formData: FormData,
  cambiar: (id: number, activo: boolean) => Promise<unknown | undefined>,
): Promise<boolean> {
  const id = idSchema.safeParse(formData.get("id"));
  const activo = formData.get("activo");
  if (!id.success || (activo !== "true" && activo !== "false")) return false;
  return (await cambiar(id.data, activo === "true")) !== undefined;
}
