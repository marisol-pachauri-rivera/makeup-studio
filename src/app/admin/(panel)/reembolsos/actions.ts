"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requerirAdmin } from "@/lib/auth/sesion";
import { procesarMarcado } from "@/lib/cancelacion/formulario-reembolso";
import { marcarReembolsoRealizado } from "@/lib/cancelacion/reembolsos";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";

/**
 * Marca un reembolso como realizado. Empieza por la sesión (ADR 0007) y valida con Zod antes de tocar
 * la base (ADR 0006). Tras aplicarlo se revalida la lista: la reserva sale de los pendientes.
 */
export async function marcarReembolso(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await procesarMarcado(formData, { marcar: (id) => marcarReembolsoRealizado(getDb(), id) });
  if (resultado.estado === "aplicada") revalidatePath("/admin/reembolsos");
  return resultado;
}
