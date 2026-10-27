import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearReserva } from "../../../tests/support/fixtures";
import { condicionVencida, PLAZO_VENCIMIENTO_MINUTOS } from "./vencimiento";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-12-21T15:00:00Z");
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60_000);

async function estaVencida(id: number) {
  const filas = await db
    .select({ id: reserva.id })
    .from(reserva)
    .where(sql`${reserva.id} = ${id} and ${condicionVencida(AHORA)}`);
  return filas.length === 1;
}

describe("regla de vencimiento", () => {
  it("el plazo es de 20 minutos", () => {
    expect(PLAZO_VENCIMIENTO_MINUTOS).toBe(20);
  });

  it("vence con 21 minutos sin número ni motivo de rechazo", async () => {
    const r = await crearReserva(db, { creadaEn: haceMinutos(21) });
    expect(await estaVencida(r.id)).toBe(true);
  });

  it("no vence con 19 minutos", async () => {
    const r = await crearReserva(db, { creadaEn: haceMinutos(19) });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("no vence con exactamente 20 minutos (vence con más de 20)", async () => {
    const r = await crearReserva(db, { creadaEn: haceMinutos(20) });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("vence apenas se pasa de los 20 minutos", async () => {
    const r = await crearReserva(db, { creadaEn: new Date(haceMinutos(20).getTime() - 1) });
    expect(await estaVencida(r.id)).toBe(true);
  });

  it("no vence si volvió a pendiente de pago por un rechazo, por antigua que sea", async () => {
    const r = await crearReserva(db, { creadaEn: haceMinutos(600), motivoRechazo: "No coincide con ningún pago" });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("no vence en pendiente de validación", async () => {
    const r = await crearReserva(db, {
      creadaEn: haceMinutos(600),
      estado: "pendiente_validacion",
      numeroOperacion: "OP-1",
    });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("no vence si está confirmada", async () => {
    const r = await crearReserva(db, { creadaEn: haceMinutos(600), estado: "confirmada", numeroOperacion: "OP-2" });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("no vence si ya está cancelada", async () => {
    const r = await crearReserva(db, {
      creadaEn: haceMinutos(600),
      estado: "cancelada",
      motivoCancelacion: "studio",
    });
    expect(await estaVencida(r.id)).toBe(false);
  });

  it("distingue varias reservas a la vez", async () => {
    const vieja = await crearReserva(db, { creadaEn: haceMinutos(40) });
    const nueva = await crearReserva(db, { creadaEn: haceMinutos(2) });
    const vencidas = await db.select({ id: reserva.id }).from(reserva).where(condicionVencida(AHORA));
    expect(vencidas.map((v) => v.id)).toEqual([vieja.id]);
    expect(vencidas.map((v) => v.id)).not.toContain(nueva.id);
    expect((await db.select().from(reserva).where(eq(reserva.id, nueva.id)))[0].estado).toBe("pendiente_pago");
  });
});
