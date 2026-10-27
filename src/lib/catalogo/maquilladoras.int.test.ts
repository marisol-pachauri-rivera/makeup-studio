import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo, maquilladora, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora as crearMaquilladoraFixture, hora } from "../../../tests/support/fixtures";
import {
  actualizarMaquilladora,
  cambiarActivaMaquilladora,
  crearMaquilladora,
  listarMaquilladoras,
  obtenerMaquilladora,
} from "./maquilladoras";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

describe("crearMaquilladora", () => {
  it("guarda la maquilladora activa", async () => {
    const creada = await crearMaquilladora(db, { nombre: "Lucía" });
    expect(creada).toMatchObject({ nombre: "Lucía", activa: true });
    expect((await obtenerMaquilladora(db, creada.id))?.nombre).toBe("Lucía");
  });

  it("permite nombres repetidos", async () => {
    await crearMaquilladora(db, { nombre: "Ana" });
    await crearMaquilladora(db, { nombre: "Ana" });
    expect(await listarMaquilladoras(db)).toHaveLength(2);
  });
});

describe("actualizarMaquilladora", () => {
  it("renombra y deja el estado como estaba", async () => {
    const { id } = await crearMaquilladora(db, { nombre: "Ana" });
    await cambiarActivaMaquilladora(db, id, false);

    expect(await actualizarMaquilladora(db, id, { nombre: "Ana María" })).toMatchObject({
      id,
      nombre: "Ana María",
      activa: false,
    });
  });

  it("devuelve undefined si no existe y no crea nada", async () => {
    expect(await actualizarMaquilladora(db, 999, { nombre: "X" })).toBeUndefined();
    expect(await listarMaquilladoras(db)).toHaveLength(0);
  });

  it("no toca horarios, bloqueos ni líneas de reserva", async () => {
    const m = await crearMaquilladoraFixture(db);
    await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
    await db.insert(bloqueoAgenda).values({
      maquilladoraId: m.id,
      inicio: hora("10:00"),
      fin: hora("12:00"),
      motivo: "Capacitación",
    });
    await crearLinea(db, { maquilladoraId: m.id, inicio: hora("14:00"), fin: hora("15:00") });

    await actualizarMaquilladora(db, m.id, { nombre: "Nuevo nombre" });

    expect(await db.select().from(horarioTrabajo).where(eq(horarioTrabajo.maquilladoraId, m.id))).toHaveLength(1);
    expect(await db.select().from(bloqueoAgenda).where(eq(bloqueoAgenda.maquilladoraId, m.id))).toHaveLength(1);
    expect(await db.select().from(reservaLinea).where(eq(reservaLinea.maquilladoraId, m.id))).toHaveLength(1);
  });
});

describe("cambiarActivaMaquilladora", () => {
  it("desactiva y reactiva sin borrar", async () => {
    const { id } = await crearMaquilladora(db, { nombre: "Ana" });

    expect((await cambiarActivaMaquilladora(db, id, false))?.activa).toBe(false);
    expect(await listarMaquilladoras(db)).toHaveLength(1);
    expect((await cambiarActivaMaquilladora(db, id, true))?.activa).toBe(true);
  });

  it("es idempotente: repetir el estado destino no falla", async () => {
    const { id } = await crearMaquilladora(db, { nombre: "Ana" });
    await cambiarActivaMaquilladora(db, id, false);
    expect((await cambiarActivaMaquilladora(db, id, false))?.activa).toBe(false);
  });

  it("no cancela ni modifica las reservas de la maquilladora", async () => {
    const m = await crearMaquilladoraFixture(db);
    const linea = await crearLinea(db, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });

    await cambiarActivaMaquilladora(db, m.id, false);

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada.activa).toBe(true);
  });

  it("devuelve undefined si no existe", async () => {
    expect(await cambiarActivaMaquilladora(db, 999, false)).toBeUndefined();
  });
});

describe("listarMaquilladoras", () => {
  it("devuelve activas e inactivas, con las activas primero y por nombre", async () => {
    const b = await crearMaquilladora(db, { nombre: "B" });
    await crearMaquilladora(db, { nombre: "C" });
    await crearMaquilladora(db, { nombre: "A" });
    await cambiarActivaMaquilladora(db, b.id, false);

    expect((await listarMaquilladoras(db)).map((m) => [m.nombre, m.activa])).toEqual([
      ["A", true],
      ["C", true],
      ["B", false],
    ]);
  });

  it("devuelve una lista vacía sin maquilladoras", async () => {
    expect(await listarMaquilladoras(db)).toEqual([]);
  });
});

describe("integridad que la base sigue haciendo cumplir", () => {
  it("rechaza borrar una maquilladora con líneas de reserva", async () => {
    const m = await crearMaquilladoraFixture(db);
    await crearLinea(db, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });

    await expect(db.delete(maquilladora).where(eq(maquilladora.id, m.id))).rejects.toThrow();
    expect(await obtenerMaquilladora(db, m.id)).toBeDefined();
  });
});
