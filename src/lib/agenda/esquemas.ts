import { z } from "zod";
import { deLocalAInstante } from "./zona-horaria";

// Límite del motivo: no viene del PRD, ver design.md (decisión 4).
export const MAX_MOTIVO = 200;

/** `HH:mm` de 00:00 a 23:59, con dos dígitos. */
const hora = (mensaje: string) =>
  z
    .string({ error: mensaje })
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, mensaje);

const diaSemana = z
  .string({ error: "Elegí un día de la semana." })
  .trim()
  .regex(/^[0-6]$/, "Elegí un día de la semana.")
  .transform(Number);

export const horarioSchema = z
  .object({
    diaSemana,
    horaInicio: hora("La hora de inicio no es válida: usá el formato HH:MM."),
    horaFin: hora("La hora de fin no es válida: usá el formato HH:MM."),
  })
  .refine((h) => h.horaFin > h.horaInicio, {
    path: ["horaFin"],
    error: "La hora de fin debe ser posterior a la de inicio.",
  });

/** Fecha y hora local del studio (`YYYY-MM-DDTHH:mm`) convertida a instante UTC. */
const instanteLocal = (campo: string) =>
  z
    .string({ error: `${campo} no es válido.` })
    .trim()
    .transform((texto, ctx) => {
      const instante = deLocalAInstante(texto);
      if (!instante) {
        ctx.addIssue({ code: "custom", message: `${campo} no es una fecha y hora válida.` });
        return z.NEVER;
      }
      return instante;
    });

export const bloqueoSchema = z
  .object({
    inicio: instanteLocal("El inicio"),
    fin: instanteLocal("El fin"),
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo es obligatorio.")
      .max(MAX_MOTIVO, `El motivo admite hasta ${MAX_MOTIVO} caracteres.`),
  })
  .refine((b) => b.fin.getTime() > b.inicio.getTime(), {
    path: ["fin"],
    error: "El fin debe ser posterior al inicio.",
  });

export type DatosHorario = z.output<typeof horarioSchema>;
export type DatosBloqueo = z.output<typeof bloqueoSchema>;
