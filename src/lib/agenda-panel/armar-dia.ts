import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { AgendaDelDia, TurnoDelDia } from "./consulta";

export type FilaDeTurno = {
  tipo: "turno";
  clave: string;
  inicio: Date;
  /** `10:00 a 11:00`, en hora de Lima; con la fecha (`21/12 22:00`) si el turno empieza otro día. */
  hora: string;
  persona: string;
  servicio: string;
  /** El estado de la reserva, escrito: no depende del color. */
  estado: string;
  /** Texto adicional (`Plazo vencido`), también escrito. */
  marcas: string[];
  /** Nombre de contacto, solo si difiere del de la persona (en la reserva individual es el mismo). */
  contacto: string | null;
  telefono: string;
};

export type FilaDeBloqueo = {
  tipo: "bloqueo";
  clave: string;
  inicio: Date;
  hora: string;
  motivo: string;
};

export type FilaDeAgenda = FilaDeTurno | FilaDeBloqueo;

export type SeccionDeMaquilladora = {
  id: number;
  nombre: string;
  activa: boolean;
  /** Tramos de trabajo del día (`09:00 a 13:00`); vacío si no trabaja ese día. */
  horario: string[];
  /** Turnos y bloqueos mezclados en orden cronológico. */
  filas: FilaDeAgenda[];
};

const sinSegundos = (hora: string) => hora.slice(0, 5);

/** `Pendiente de pago`, `Pago rechazado`, `Pendiente de validación`, `Confirmada`; el resto no llega (se filtra por `activa`). */
export function etiquetaDeEstado(turno: Pick<TurnoDelDia, "estadoReserva" | "motivoRechazo">): string {
  switch (turno.estadoReserva) {
    case "pendiente_pago":
      return turno.motivoRechazo !== null ? "Pago rechazado" : "Pendiente de pago";
    case "pendiente_validacion":
      return "Pendiente de validación";
    case "confirmada":
      return "Confirmada";
    case "cancelada":
      return "Cancelada";
  }
}

function rango(fecha: string, inicio: Date, fin: Date): string {
  const i = aPartesLocales(inicio);
  const f = aPartesLocales(fin);
  const dia = (partes: { fecha: string; hora: string }) =>
    partes.fecha === fecha ? partes.hora : `${partes.fecha.slice(8, 10)}/${partes.fecha.slice(5, 7)} ${partes.hora}`;
  return `${dia(i)} a ${dia(f)}`;
}

/**
 * Arma lo que muestra la pantalla: una sección por maquilladora (las activas siempre; las inactivas solo si
 * tienen turnos ese día, para no esconder una reserva viva) con sus turnos y bloqueos en una sola línea de
 * tiempo. Es una función pura: no lee la base ni el reloj.
 */
export function armarDia(agenda: AgendaDelDia): SeccionDeMaquilladora[] {
  const secciones: SeccionDeMaquilladora[] = [];

  for (const m of agenda.maquilladoras) {
    const turnos = agenda.turnos.filter((t) => t.maquilladoraId === m.id);
    if (!m.activa && turnos.length === 0) continue;

    const filas: FilaDeAgenda[] = [
      ...turnos.map(
        (t): FilaDeTurno => ({
          tipo: "turno",
          clave: `turno-${t.lineaId}`,
          inicio: t.inicio,
          hora: rango(agenda.fecha, t.inicio, t.fin),
          persona: t.persona,
          servicio: t.servicio,
          estado: etiquetaDeEstado(t),
          marcas: t.vencida ? ["Plazo vencido"] : [],
          contacto: t.nombreContacto === t.persona ? null : t.nombreContacto,
          telefono: t.telefonoContacto,
        }),
      ),
      ...agenda.bloqueos
        .filter((b) => b.maquilladoraId === m.id)
        .map(
          (b): FilaDeBloqueo => ({
            tipo: "bloqueo",
            clave: `bloqueo-${b.id}`,
            inicio: b.inicio,
            hora: rango(agenda.fecha, b.inicio, b.fin),
            motivo: b.motivo,
          }),
        ),
    ].sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.clave.localeCompare(b.clave));

    secciones.push({
      id: m.id,
      nombre: m.nombre,
      activa: m.activa,
      horario: (agenda.tramos.get(m.id) ?? []).map((t) => `${sinSegundos(t.horaInicio)} a ${sinSegundos(t.horaFin)}`),
      filas,
    });
  }

  return secciones;
}
