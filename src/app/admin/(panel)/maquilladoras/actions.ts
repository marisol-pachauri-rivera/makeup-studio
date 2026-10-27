"use server";

import { notFound, redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requerirAdmin } from "@/lib/auth/sesion";
import {
  procesarAltaMaquilladora,
  procesarCambioDeEstado,
  procesarEdicionMaquilladora,
  type EstadoFormulario,
} from "@/lib/catalogo/formularios";
import * as maquilladoras from "@/lib/catalogo/maquilladoras";

export async function crearMaquilladora(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await procesarAltaMaquilladora(formData, {
    crear: (datos) => maquilladoras.crearMaquilladora(getDb(), datos),
  });
  if ("redirigirA" in resultado) redirect(resultado.redirigirA);
  if ("noEncontrado" in resultado) notFound();
  return resultado;
}

export async function actualizarMaquilladora(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await procesarEdicionMaquilladora(formData, {
    actualizar: (id, datos) => maquilladoras.actualizarMaquilladora(getDb(), id, datos),
  });
  if ("redirigirA" in resultado) redirect(resultado.redirigirA);
  if ("noEncontrado" in resultado) notFound();
  return resultado;
}

/** Fija el estado destino que manda el formulario del botón (`activo=true|false`); repetirlo no cambia nada más. */
export async function cambiarEstadoMaquilladora(formData: FormData): Promise<void> {
  await requerirAdmin();
  const existe = await procesarCambioDeEstado(formData, (id, activo) =>
    maquilladoras.cambiarActivaMaquilladora(getDb(), id, activo),
  );
  if (!existe) notFound();
  refresh();
}
