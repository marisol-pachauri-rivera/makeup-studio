/**
 * Anticipación mínima, en horas, para cancelar o reprogramar desde el enlace (PRD). Es una duración
 * absoluta contra el reloj del servidor: la zona del studio solo se usa para mostrar la fecha límite.
 */
export const PLAZO_CANCELACION_HORAS = 24;

const HORA_MS = 60 * 60 * 1000;

/** Último instante en que todavía se puede cancelar un turno que empieza en `primerTurno`. */
export function limiteDeCancelacion(primerTurno: Date): Date {
  return new Date(primerTurno.getTime() - PLAZO_CANCELACION_HORAS * HORA_MS);
}

/** Con exactamente 24 horas de anticipación todavía se puede; con 23 h 59 min no. */
export function puedeCancelar(primerTurno: Date, ahora: Date): boolean {
  return ahora.getTime() <= limiteDeCancelacion(primerTurno).getTime();
}
