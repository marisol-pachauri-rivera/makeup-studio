import { idReservaSchema } from "@/lib/reservas-panel/esquemas";
import { MENSAJE_NO_ENCONTRADA, type ResultadoAccion } from "@/lib/reservas-panel/formularios";
import type { ResultadoMarcado } from "./reembolsos";

const MENSAJES: Record<Exclude<ResultadoMarcado["estado"], "realizado">, string> = {
  ya_realizado: "Este reembolso ya estaba marcado como realizado.",
  no_aplica: "Esta reserva no tiene un reembolso por hacer, así que no se puede marcar.",
  no_encontrada: MENSAJE_NO_ENCONTRADA,
};

/**
 * Marcar un reembolso como realizado. Valida el identificador con Zod antes de tocar la base: uno
 * inválido o ausente se trata como reserva no encontrada. `FormData.get` puede devolver `null` o un
 * archivo; ambos llegan al esquema como dato inválido.
 */
export async function procesarMarcado(
  formData: FormData,
  deps: { marcar: (id: number) => Promise<ResultadoMarcado> },
): Promise<ResultadoAccion> {
  const id = idReservaSchema.safeParse(formData.get("id"));
  if (!id.success) return { estado: "aviso", mensaje: MENSAJE_NO_ENCONTRADA };

  const resultado = await deps.marcar(id.data);
  if (resultado.estado === "realizado") return { estado: "aplicada" };
  return { estado: "aviso", mensaje: MENSAJES[resultado.estado] };
}
