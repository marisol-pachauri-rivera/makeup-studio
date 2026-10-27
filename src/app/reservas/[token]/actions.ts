"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { cancelarReservaDeLaClienta } from "@/lib/cancelacion/cancelar";
import {
  procesarCancelacion,
  type EstadoFormulario as EstadoCancelacion,
  type ResultadoFormulario as ResultadoCancelacion,
} from "@/lib/cancelacion/formulario";
import { procesarIngreso, type EstadoFormulario, type ResultadoFormulario } from "@/lib/pago/formulario";
import { ingresarNumeroDeOperacion } from "@/lib/pago/ingreso";

/**
 * Informa el pago de una reserva con el número de operación (ADR 0006). No usa `requerirAdmin()`: las
 * clientas no tienen cuenta; el token del enlace y la validación del servidor son su protección. Tras
 * informarlo, `refresh()` vuelve a leer la página para que muestre la reserva en validación.
 */
export async function ingresarNumero(_estado: EstadoFormulario, formData: FormData): Promise<ResultadoFormulario> {
  const resultado = await procesarIngreso(formData, {
    ingresar: (ingreso) => ingresarNumeroDeOperacion(getDb(), ingreso),
  });
  if (resultado.estado === "registrado") refresh();
  return resultado;
}

/**
 * Cancela la reserva completa desde el enlace (ADR 0004: quien tenga el token puede cancelar, sin
 * sesión). El servidor decide el plazo de 24 horas contra su reloj; la pantalla solo lo anticipa.
 * `refresh()` al éxito vuelve a leer la página para que muestre la reserva cancelada.
 */
export async function cancelarReserva(_estado: EstadoCancelacion, formData: FormData): Promise<ResultadoCancelacion> {
  const resultado = await procesarCancelacion(formData, {
    cancelar: (token) => cancelarReservaDeLaClienta(getDb(), { token }, new Date()),
  });
  if (resultado.estado === "cancelada") refresh();
  return resultado;
}
