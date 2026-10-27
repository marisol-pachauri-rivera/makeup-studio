import { aPartesLocales } from "@/lib/agenda/zona-horaria";

/**
 * Fechas de calendario `YYYY-MM-DD` del studio. Las sumas y el día de la semana se hacen con
 * `Date.UTC` sobre la fecha, sin hora, así que no dependen de la zona del proceso.
 */

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La fecha de hoy en la zona del studio (a las 03:00 UTC del 25/12 todavía es 24/12 en Lima). */
export function hoyLocal(ahora: Date): string {
  return aPartesLocales(ahora).fecha;
}

function aUtc(fecha: string): Date {
  const m = FECHA.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo, como `horario_trabajo.dia_semana`. */
export function diaDeLaSemana(fecha: string): number {
  return aUtc(fecha).getUTCDay();
}
