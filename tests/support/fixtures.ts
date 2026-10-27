import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { maquilladora, reserva, reservaLinea, servicio } from "@/db/schema";
import type { Tx } from "./db";

type Ejecutor = NodePgDatabase | Tx;

export async function crearMaquilladora(db: Ejecutor, extra: Partial<typeof maquilladora.$inferInsert> = {}) {
  const [fila] = await db.insert(maquilladora).values({ nombre: "Ana", ...extra }).returning();
  return fila;
}

export async function crearServicio(db: Ejecutor, extra: Partial<typeof servicio.$inferInsert> = {}) {
  const [fila] = await db
    .insert(servicio)
    .values({ nombre: "Maquillaje social", precio: "120.00", duracionMinutos: 60, ...extra })
    .returning();
  return fila;
}

export async function crearReserva(db: Ejecutor, extra: Partial<typeof reserva.$inferInsert> = {}) {
  const [fila] = await db
    .insert(reserva)
    .values({ nombreContacto: "Lucía", telefonoContacto: "999111222", montoTotal: "120.00", ...extra })
    .returning();
  return fila;
}

/** Línea con rango `inicio`-`fin` en ISO; crea la reserva, el servicio y la maquilladora si no se pasan. */
export async function crearLinea(
  db: Ejecutor,
  extra: Partial<typeof reservaLinea.$inferInsert> & { inicio: Date; fin: Date },
) {
  const [fila] = await db
    .insert(reservaLinea)
    .values({
      reservaId: extra.reservaId ?? (await crearReserva(db)).id,
      servicioId: extra.servicioId ?? (await crearServicio(db)).id,
      maquilladoraId: extra.maquilladoraId ?? (await crearMaquilladora(db)).id,
      persona: "Lucía",
      precio: "120.00",
      ...extra,
    })
    .returning();
  return fila;
}

/** Instante de un día fijo, para escribir turnos como `hora("10:00")`. */
export const hora = (hhmm: string, dia = "2026-03-02") => new Date(`${dia}T${hhmm}:00Z`);
