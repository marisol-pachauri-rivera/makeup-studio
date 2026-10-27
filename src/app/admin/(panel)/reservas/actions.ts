"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requerirAdmin } from "@/lib/auth/sesion";
import {
  procesarCancelacion,
  procesarRechazo,
  procesarValidacion,
  type EstadoFormulario,
  type ResultadoAccion,
} from "@/lib/reservas-panel/formularios";
import * as transiciones from "@/lib/reservas-panel/transiciones";

/** Tras aplicar la transición se refresca la pantalla para mostrar el estado nuevo; un aviso no cambia nada. */
function refrescarSiSeAplico(resultado: ResultadoAccion): ResultadoAccion {
  if (resultado.estado === "aplicada") refresh();
  return resultado;
}

// Cada acción empieza por la sesión (ADR 0007) y valida con Zod antes de tocar la base (ADR 0006).

export async function validarPago(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  return refrescarSiSeAplico(
    await procesarValidacion(formData, { validar: (id) => transiciones.validarReserva(getDb(), id) }),
  );
}

export async function rechazarPago(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  return refrescarSiSeAplico(
    await procesarRechazo(formData, { rechazar: (id, motivo) => transiciones.rechazarReserva(getDb(), id, motivo) }),
  );
}

export async function cancelarReserva(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  return refrescarSiSeAplico(
    await procesarCancelacion(formData, { cancelar: (id) => transiciones.cancelarReserva(getDb(), id) }),
  );
}
