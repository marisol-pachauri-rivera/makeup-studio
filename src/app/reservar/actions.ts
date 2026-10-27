"use server";

import { getDb } from "@/db";
import { procesarConfirmacion, type EstadoConfirmacion, type ResultadoConfirmacion } from "@/lib/reserva/confirmacion";
import { crearReservaGrupal } from "@/lib/reserva/crear-grupal";
import { crearReservaIndividual } from "@/lib/reserva/crear";

/**
 * Única escritura pública del flujo de reserva (ADR 0006 y 0008), individual o grupal según lleve o no
 * el campo `personas`. No usa `requerirAdmin()`: las clientas no tienen cuenta. Se protege con la
 * validación del servidor y con la revalidación de disponibilidad. Devuelve el token en vez de
 * redirigir para que el cliente pueda borrar su estado antes de navegar.
 */
export async function confirmarReserva(_estado: EstadoConfirmacion, formData: FormData): Promise<ResultadoConfirmacion> {
  return procesarConfirmacion(formData, {
    crear: (solicitud) => crearReservaIndividual(getDb(), solicitud, new Date()),
    crearGrupo: (solicitud) => crearReservaGrupal(getDb(), solicitud, new Date()),
  });
}
