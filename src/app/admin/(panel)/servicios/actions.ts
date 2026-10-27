"use server";

import { notFound, redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requerirAdmin } from "@/lib/auth/sesion";
import {
  procesarAltaServicio,
  procesarCambioDeEstado,
  procesarEdicionServicio,
  type EstadoFormulario,
} from "@/lib/catalogo/formularios";
import * as servicios from "@/lib/catalogo/servicios";

export async function crearServicio(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await procesarAltaServicio(formData, { crear: (datos) => servicios.crearServicio(getDb(), datos) });
  if ("redirigirA" in resultado) redirect(resultado.redirigirA);
  if ("noEncontrado" in resultado) notFound();
  return resultado;
}

export async function actualizarServicio(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await procesarEdicionServicio(formData, {
    actualizar: (id, datos) => servicios.actualizarServicio(getDb(), id, datos),
  });
  if ("redirigirA" in resultado) redirect(resultado.redirigirA);
  if ("noEncontrado" in resultado) notFound();
  return resultado;
}

/** Fija el estado destino que manda el formulario del botón; repetirlo no cambia nada más. */
export async function cambiarEstadoServicio(formData: FormData): Promise<void> {
  await requerirAdmin();
  const existe = await procesarCambioDeEstado(formData, (id, activo) =>
    servicios.cambiarActivoServicio(getDb(), id, activo),
  );
  if (!existe) notFound();
  refresh();
}
