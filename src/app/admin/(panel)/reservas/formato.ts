import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import { fechaCorta } from "@/components/publico/formato-fecha";
import type { reserva } from "@/db/schema";

type Fila = typeof reserva.$inferSelect;

export const ETIQUETA_ESTADO: Record<Fila["estado"], string> = {
  pendiente_pago: "Pendiente de pago",
  pendiente_validacion: "Pendiente de validación",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export const VARIANTE_ESTADO: Record<Fila["estado"], "default" | "secondary" | "outline" | "destructive"> = {
  pendiente_pago: "secondary",
  pendiente_validacion: "default",
  confirmada: "outline",
  cancelada: "destructive",
};

export const ETIQUETA_REEMBOLSO: Record<Fila["estadoReembolso"], string> = {
  no_aplica: "No aplica",
  pendiente: "Reembolso pendiente",
  realizado: "Reembolso realizado",
};

export const ETIQUETA_MOTIVO_CANCELACION: Record<NonNullable<Fila["motivoCancelacion"]>, string> = {
  vencida: "Venció sin pago",
  clienta: "Cancelada por la clienta",
  studio: "Cancelada por el studio",
};

/** `lun, 21 dic · 10:00`, en hora de Lima. */
export function formatearTurno(inicio: Date): string {
  const { fecha, hora } = aPartesLocales(inicio);
  return `${fechaCorta(fecha)} · ${hora}`;
}

/** `10:00 a 11:00`, en hora de Lima. */
export function formatearRango(inicio: Date, fin: Date): string {
  return `${aPartesLocales(inicio).hora} a ${aPartesLocales(fin).hora}`;
}

/** Enlace `tel:` con solo dígitos y el `+` inicial: el teléfono se guarda tal como lo escribió la clienta. */
export function enlaceTelefono(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, "")}`;
}
