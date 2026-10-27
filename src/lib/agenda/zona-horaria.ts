/**
 * Hora local del studio. El servidor corre en UTC y el navegador puede tener otra zona, así que la
 * conversión depende solo de esta constante (supuesto a confirmar con el studio, ver design.md).
 */
export const ZONA_STUDIO = "America/Lima";

const TEXTO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DIA_MS = 24 * 60 * 60 * 1000;

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_STUDIO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type PartesLocales = { fecha: string; hora: string; texto: string };

/** Fecha y hora de un instante vistas en la zona del studio. `texto` es el formato de `datetime-local`. */
export function aPartesLocales(instante: Date): PartesLocales {
  const partes: Record<string, string> = {};
  for (const { type, value } of formato.formatToParts(instante)) partes[type] = value;
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const hora = `${partes.hour}:${partes.minute}`;
  return { fecha, hora, texto: `${fecha}T${hora}` };
}

/** Desfase (ms) de la zona respecto de UTC en ese instante: hora local menos hora UTC. */
function desfase(instante: Date): number {
  const [fecha, hora] = aPartesLocales(instante).texto.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const comoUtc = Date.UTC(anio, mes - 1, dia, h, min);
  return comoUtc - Math.floor(instante.getTime() / 60_000) * 60_000;
}

/**
 * Convierte `YYYY-MM-DDTHH:mm` (hora local del studio) a un instante UTC. Devuelve `null` si el texto
 * no tiene ese formato, si la fecha u hora no existe (`2026-02-30`, `25:00`) o si esa hora local no
 * existe o es ambigua en la zona (saltos de horario de verano): no se adivina.
 */
export function deLocalAInstante(texto: string): Date | null {
  const m = TEXTO_LOCAL.exec(texto);
  if (!m) return null;
  const [anio, mes, dia, h, min] = m.slice(1).map(Number);
  const comoUtc = Date.UTC(anio, mes - 1, dia, h, min);
  const calendario = new Date(comoUtc);
  if (
    calendario.getUTCFullYear() !== anio ||
    calendario.getUTCMonth() !== mes - 1 ||
    calendario.getUTCDate() !== dia ||
    h > 23 ||
    min > 59
  ) {
    return null;
  }

  // Un candidato por cada desfase que la zona tenga cerca de esa fecha; vale el que vuelve a dar el mismo texto.
  const candidatos = new Set<number>();
  for (const cerca of [comoUtc - DIA_MS, comoUtc, comoUtc + DIA_MS]) {
    const instante = comoUtc - desfase(new Date(cerca));
    if (aPartesLocales(new Date(instante)).texto === texto) candidatos.add(instante);
  }
  if (candidatos.size !== 1) return null;
  return new Date([...candidatos][0]);
}
