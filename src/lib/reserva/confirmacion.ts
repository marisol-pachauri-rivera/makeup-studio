import { erroresPorCampo } from "@/lib/catalogo/esquemas";
import type { ResultadoReserva } from "./crear";
import type { ResultadoGrupo } from "./crear-grupal";
import {
  CAMPOS_GRUPO,
  CAMPOS_SOLICITUD,
  erroresPorRuta,
  leerPersonas,
  solicitudGrupalSchema,
  solicitudReservaSchema,
  type SolicitudGrupal,
  type SolicitudReserva,
} from "./esquemas";

/** Lo que la Server Action devuelve al paso de confirmación. */
export type ResultadoConfirmacion =
  | { estado: "ok"; token: string }
  | { estado: "horario_no_disponible" }
  | { estado: "no_disponible" }
  /**
   * Un grupo que no se pudo crear, con qué integrantes lo impiden (posiciones en `personas`).
   * No se guardó nada: la clienta conserva el grupo y corrige solo a las afectadas.
   */
  | {
      estado: "grupo_rechazado";
      noDisponibles: number[];
      horariosNoDisponibles: number[];
      solapamientos: [number, number][];
    }
  /**
   * `errores` por campo (`nombre`, `telefono`) y, en un grupo, por integrante (`personas.2.nombre`);
   * `valores` escritos, para repoblar el formulario.
   */
  | { estado: "invalido"; errores: Record<string, string>; valores: Record<string, string> };

export type EstadoConfirmacion = ResultadoConfirmacion | { estado: "inicial" };

/** Campos de la solicitud que la clienta no escribe: si fallan, hay que volver a elegir el horario. */
export const CAMPOS_DE_SELECCION = ["clave", "servicioId", "maquilladoraId", "inicio"] as const;

type Dependencias = {
  crear: (solicitud: SolicitudReserva) => Promise<ResultadoReserva>;
  crearGrupo: (solicitud: SolicitudGrupal) => Promise<ResultadoGrupo>;
};

function comoTexto(entrada: Record<string, unknown>) {
  const valores: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(entrada)) valores[campo] = typeof valor === "string" ? valor : "";
  return valores;
}

/**
 * Valida con Zod antes de tocar la base (ADR 0006) y despacha: una solicitud con el campo `personas`
 * es un grupo; sin él, la reserva individual de siempre. `FormData.get` puede devolver `null` o un
 * archivo: ambos llegan al esquema como dato inválido.
 */
export async function procesarConfirmacion(formData: FormData, deps: Dependencias): Promise<ResultadoConfirmacion> {
  if (formData.has("personas")) return procesarGrupo(formData, deps);

  const entrada: Record<string, FormDataEntryValue | null> = {};
  for (const campo of CAMPOS_SOLICITUD) entrada[campo] = formData.get(campo);

  const solicitud = solicitudReservaSchema.safeParse(entrada);
  if (!solicitud.success) {
    return { estado: "invalido", errores: erroresPorCampo(solicitud.error), valores: comoTexto(entrada) };
  }

  const resultado = await deps.crear(solicitud.data);
  return resultado.estado === "creada" ? { estado: "ok", token: resultado.token } : { estado: resultado.estado };
}

async function procesarGrupo(formData: FormData, deps: Dependencias): Promise<ResultadoConfirmacion> {
  const entrada: Record<string, unknown> = {};
  for (const campo of CAMPOS_GRUPO) entrada[campo] = formData.get(campo);
  // El JSON de `personas` no lanza si está roto: llega como `undefined` y el esquema lo rechaza.
  const datos = { ...entrada, personas: leerPersonas(formData.get("personas")) };

  const solicitud = solicitudGrupalSchema.safeParse(datos);
  if (!solicitud.success) {
    return {
      estado: "invalido",
      errores: erroresPorRuta(solicitud.error),
      valores: comoTexto({ clave: entrada.clave, nombre: entrada.nombre, telefono: entrada.telefono }),
    };
  }

  const resultado = await deps.crearGrupo(solicitud.data);
  if (resultado.estado === "creada") return { estado: "ok", token: resultado.token };
  return {
    estado: "grupo_rechazado",
    noDisponibles: resultado.noDisponibles,
    horariosNoDisponibles: resultado.horariosNoDisponibles,
    solapamientos: resultado.solapamientos,
  };
}
