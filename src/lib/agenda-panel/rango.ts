import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { diaDeLaSemana, sumarDias } from "@/lib/disponibilidad/fechas";

/** Medianoche local (en la zona del studio) de una fecha `YYYY-MM-DD`, con respaldo en UTC si esa hora no existe. */
function medianoche(fecha: string): Date {
  return deLocalAInstante(`${fecha}T00:00`) ?? new Date(`${fecha}T00:00:00Z`);
}

/**
 * Los instantes UTC que delimitan un día de Lima: de la 00:00 local de `fecha` (incluida) a la 00:00 del
 * día siguiente (excluida). Un turno o bloqueo pertenece al día si se solapa con ese rango semiabierto.
 */
export function limitesDelDia(fecha: string): { inicio: Date; fin: Date } {
  return { inicio: medianoche(fecha), fin: medianoche(sumarDias(fecha, 1)) };
}

/** Las siete fechas de la semana de `fecha`, de lunes a domingo. */
export function semanaDe(fecha: string): string[] {
  const desdeElLunes = (diaDeLaSemana(fecha) + 6) % 7;
  const lunes = sumarDias(fecha, -desdeElLunes);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}
