"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  procesarReprogramacion,
  type EstadoFormulario,
  type ResultadoFormulario,
} from "@/lib/reprogramacion/formulario";
import { reprogramarTurno } from "@/lib/reprogramacion/reprogramar";

/**
 * Reprograma un turno desde el enlace (ADR 0004: quien tenga el token puede hacerlo, sin sesión; ADR 0006:
 * Zod antes de tocar la base). El servidor decide el plazo de 24 horas contra su reloj. Al éxito, vuelve a
 * la página de estado, que ya muestra el turno nuevo; si no se pudo, devuelve el aviso y el turno original
 * queda intacto.
 */
export async function reprogramar(_estado: EstadoFormulario, formData: FormData): Promise<ResultadoFormulario> {
  const resultado = await procesarReprogramacion(formData, {
    reprogramar: (solicitud) => reprogramarTurno(getDb(), solicitud, new Date()),
  });
  // El token ya pasó por Zod (es un UUID): es seguro armar la ruta con él.
  if (resultado.estado === "reprogramada") redirect(`/reservas/${resultado.token}`);
  return resultado;
}
