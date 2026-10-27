"use server";

import { notFound } from "next/navigation";
import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requerirAdmin } from "@/lib/auth/sesion";
import * as bloqueos from "@/lib/agenda/bloqueos";
import {
  procesarAltaBloqueo,
  procesarAltaHorario,
  procesarBaja,
  type EstadoAgenda,
} from "@/lib/agenda/formularios";
import * as horarios from "@/lib/agenda/horarios";

export async function agregarHorario(_estado: EstadoAgenda, formData: FormData): Promise<EstadoAgenda> {
  await requerirAdmin();
  const resultado = await procesarAltaHorario(formData, {
    agregar: (maquilladoraId, datos) => horarios.agregarHorario(getDb(), maquilladoraId, datos),
  });
  if ("noEncontrado" in resultado) notFound();
  if (resultado.exito) refresh();
  return resultado;
}

/** Quitar dos veces el mismo tramo no falla: la segunda no encuentra nada que borrar. */
export async function quitarHorario(formData: FormData): Promise<void> {
  await requerirAdmin();
  const validos = await procesarBaja(formData, (maquilladoraId, id) =>
    horarios.quitarHorario(getDb(), maquilladoraId, id),
  );
  if (!validos) notFound();
  refresh();
}

export async function agregarBloqueo(_estado: EstadoAgenda, formData: FormData): Promise<EstadoAgenda> {
  await requerirAdmin();
  const resultado = await procesarAltaBloqueo(formData, {
    agregar: (maquilladoraId, datos) => bloqueos.agregarBloqueo(getDb(), maquilladoraId, datos),
  });
  if ("noEncontrado" in resultado) notFound();
  if (resultado.exito) refresh();
  return resultado;
}

export async function quitarBloqueo(formData: FormData): Promise<void> {
  await requerirAdmin();
  const validos = await procesarBaja(formData, (maquilladoraId, id) =>
    bloqueos.quitarBloqueo(getDb(), maquilladoraId, id),
  );
  if (!validos) notFound();
  refresh();
}
