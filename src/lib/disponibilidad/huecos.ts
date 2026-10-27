import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { DIAS_HORIZONTE, INTERVALO_MINUTOS } from "./constantes";
import { diaDeLaSemana, hoyLocal, sumarDias } from "./fechas";

/** Tramo del horario semanal: `diaSemana` 0 = domingo, horas `HH:mm` (o `HH:mm:ss`) locales del studio. */
export type TramoSemanal = { diaSemana: number; horaInicio: string; horaFin: string };

/** Rango semiabierto `[inicio, fin)` que ya no está libre (un bloqueo o una línea de reserva activa). */
export type RangoOcupado = { inicio: Date; fin: Date };

export type DiaConHuecos = {
  /** Fecha local del studio, `YYYY-MM-DD`. */
  fecha: string;
  /** Instantes de inicio de los turnos libres, en orden. */
  inicios: Date[];
};

export type EntradaHuecos = {
  tramos: readonly TramoSemanal[];
  ocupados: readonly RangoOcupado[];
  duracionMinutos: number;
  /** El instante de la consulta: nada que empiece antes se ofrece. */
  ahora: Date;
  intervaloMinutos?: number;
  dias?: number;
};

const MINUTO_MS = 60_000;

function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function aTexto(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** Ordena los tramos de un día y une los que se tocan o se solapan en uno continuo. */
function fusionar(tramos: readonly { inicio: number; fin: number }[]) {
  const ordenados = [...tramos].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  const unidos: { inicio: number; fin: number }[] = [];
  for (const tramo of ordenados) {
    const ultimo = unidos.at(-1);
    if (ultimo && tramo.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, tramo.fin);
    else unidos.push({ ...tramo });
  }
  return unidos;
}

/**
 * Turnos libres de los próximos días para un servicio de `duracionMinutos`, en hora local del studio.
 *
 * Los inicios siguen una grilla que parte del comienzo de cada tramo (fusionados si son contiguos), el
 * servicio completo debe terminar dentro del tramo, y el rango del turno no puede solaparse con un
 * ocupado (semiabierto: empezar justo donde otro termina es válido). Solo devuelve los días con al
 * menos un turno. Es una función pura: no lee la base ni el reloj.
 */
export function calcularHuecos({
  tramos,
  ocupados,
  duracionMinutos,
  ahora,
  intervaloMinutos = INTERVALO_MINUTOS,
  dias = DIAS_HORIZONTE,
}: EntradaHuecos): DiaConHuecos[] {
  const resultado: DiaConHuecos[] = [];
  const hoy = hoyLocal(ahora);

  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(hoy, i);
    const delDia = tramos
      .filter((t) => t.diaSemana === diaDeLaSemana(fecha))
      .map((t) => ({ inicio: aMinutos(t.horaInicio), fin: aMinutos(t.horaFin) }));

    const inicios: Date[] = [];
    for (const tramo of fusionar(delDia)) {
      for (let minuto = tramo.inicio; minuto + duracionMinutos <= tramo.fin; minuto += intervaloMinutos) {
        // Una hora local que no existe en la zona (salto de horario de verano) no se ofrece.
        const inicio = deLocalAInstante(`${fecha}T${aTexto(minuto)}`);
        if (!inicio || inicio.getTime() < ahora.getTime()) continue;

        const finMs = inicio.getTime() + duracionMinutos * MINUTO_MS;
        const choca = ocupados.some((o) => inicio.getTime() < o.fin.getTime() && finMs > o.inicio.getTime());
        if (!choca) inicios.push(inicio);
      }
    }
    if (inicios.length > 0) resultado.push({ fecha, inicios });
  }
  return resultado;
}
