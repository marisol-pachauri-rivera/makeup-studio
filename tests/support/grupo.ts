import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { horarioTrabajo } from "@/db/schema";
import type { SolicitudGrupal } from "@/lib/reserva/esquemas";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearMaquilladora, crearServicio } from "./fixtures";

/** 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima, así que todo el día queda por delante. */
export const MADRUGADA = new Date("2026-12-21T05:00:00Z");
export const antes = (minutos: number) => new Date(MADRUGADA.getTime() - minutos * 60_000);
export const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

let contador = 0;
export const clave = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`;

type Entidad = { id: number };

export type MundoGrupal = {
  /** Dos maquilladoras que trabajan los lunes de 09:00 a 13:00. */
  m1: Entidad;
  m2: Entidad;
  /** Servicios de 60 minutos a 350.50, de 90 a 120.10 y de 30 a 80.00 (suman 550.60). */
  s60: Entidad;
  s90: Entidad;
  s30: Entidad;
};

export async function mundoGrupal(db: NodePgDatabase): Promise<MundoGrupal> {
  const m1 = await crearMaquilladora(db, { nombre: "Ana" });
  const m2 = await crearMaquilladora(db, { nombre: "Bea" });
  for (const m of [m1, m2]) {
    await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  }
  const s60 = await crearServicio(db, { nombre: "Social", precio: "350.50", duracionMinutos: 60 });
  const s90 = await crearServicio(db, { nombre: "Artístico", precio: "120.10", duracionMinutos: 90 });
  const s30 = await crearServicio(db, { nombre: "Peinado", precio: "80.00", duracionMinutos: 30 });
  return { m1, m2, s60, s90, s30 };
}

export const persona = (nombre: string, s: Entidad, m: Entidad, hora: string) => ({
  nombre,
  servicioId: s.id,
  maquilladoraId: m.id,
  inicio: local(hora),
});

export const solicitudGrupal = (
  personas: SolicitudGrupal["personas"],
  extra: Partial<SolicitudGrupal> = {},
): SolicitudGrupal => ({
  clave: clave(),
  nombre: "Lucía Pérez",
  telefono: "999111222",
  personas,
  ...extra,
});

/** Tres integrantes: Ana (60 min, m1 a las 10:00), Bea (90 min, m2 a las 10:00) y Carla (30 min, m1 a las 11:00). */
export const trioBase = (w: MundoGrupal) => [
  persona("Ana", w.s60, w.m1, "10:00"),
  persona("Bea", w.s90, w.m2, "10:00"),
  persona("Carla", w.s30, w.m1, "11:00"),
];
