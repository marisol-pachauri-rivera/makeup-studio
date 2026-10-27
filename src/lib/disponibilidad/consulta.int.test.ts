import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo } from "@/db/schema";
import { aPartesLocales, deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva } from "../../../tests/support/fixtures";
import { consultarDisponibilidad } from "./consulta";
import type { DiaConHuecos } from "./huecos";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const AHORA = new Date("2026-12-21T05:00:00Z");
const SERVICIO = { duracionMinutos: 60 };

/** Una reserva creada en el instante de la consulta: no está vencida, así que sus líneas ocupan. */
const reservaReciente = (extra: Parameters<typeof crearReserva>[1] = {}) => crearReserva(db, { creadaEn: AHORA, ...extra });
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60_000);

const local = (fecha: string, hora: string) => deLocalAInstante(`${fecha}T${hora}`) as Date;
const horas = (dias: DiaConHuecos[], fecha: string) =>
  (dias.find((d) => d.fecha === fecha)?.inicios ?? []).map((i) => aPartesLocales(i).hora);

async function conLunes(m: { id: number }, inicio = "09:00", fin = "12:00") {
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: inicio, horaFin: fin });
}
const consultar = (m: { id: number }, ahora = AHORA) =>
  consultarDisponibilidad(db, { servicio: SERVICIO, maquilladoraId: m.id, ahora });

describe("consultarDisponibilidad", () => {
  it("ofrece el horario de trabajo cuando no hay nada que lo ocupe", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    expect(horas(await consultar(m), "2026-12-21")).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("devuelve una lista vacía si la maquilladora no tiene horarios", async () => {
    const m = await crearMaquilladora(db);
    expect(await consultar(m)).toEqual([]);
  });

  it("convierte las horas desde Lima y no desde UTC", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m, "09:00", "10:00");
    const [primero] = await consultar(m);
    expect(primero.inicios[0].toISOString()).toBe("2026-12-21T14:00:00.000Z");
  });

  it("una línea activa ocupa el horario", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    await crearLinea(db, { reservaId: (await reservaReciente()).id, maquilladoraId: m.id, inicio: local("2026-12-21", "10:00"), fin: local("2026-12-21", "11:00") });
    expect(horas(await consultar(m), "2026-12-21")).toEqual(["09:00", "11:00"]);
  });

  it("una reserva pendiente de pago también ocupa agenda", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    const pendiente = await reservaReciente({ estado: "pendiente_pago" });
    await crearLinea(db, {
      reservaId: pendiente.id,
      maquilladoraId: m.id,
      inicio: local("2026-12-21", "09:00"),
      fin: local("2026-12-21", "10:00"),
    });
    expect(horas(await consultar(m), "2026-12-21")).not.toContain("09:00");
    expect(horas(await consultar(m), "2026-12-21")).toContain("10:00");
  });

  it("una línea inactiva libera el horario", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    await crearLinea(db, {
      reservaId: (await reservaReciente()).id,
      maquilladoraId: m.id,
      inicio: local("2026-12-21", "10:00"),
      fin: local("2026-12-21", "11:00"),
      activa: false,
    });
    expect(horas(await consultar(m), "2026-12-21")).toContain("10:00");
  });

  it("una línea contigua no ocupa el turno vecino", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    await crearLinea(db, { reservaId: (await reservaReciente()).id, maquilladoraId: m.id, inicio: local("2026-12-21", "10:00"), fin: local("2026-12-21", "11:00") });
    const lunes = horas(await consultar(m), "2026-12-21");
    expect(lunes).toContain("09:00");
    expect(lunes).toContain("11:00");
  });

  describe("reservas vencidas", () => {
    const lineaDe = async (m: { id: number }, reservaId: number) =>
      crearLinea(db, {
        reservaId,
        maquilladoraId: m.id,
        inicio: local("2026-12-21", "10:00"),
        fin: local("2026-12-21", "11:00"),
      });

    it("una reserva sin pagar de más de 20 minutos deja el horario libre", async () => {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      await lineaDe(m, (await reservaReciente({ creadaEn: haceMinutos(21) })).id);
      expect(horas(await consultar(m), "2026-12-21")).toContain("10:00");
      expect(horas(await consultar(m), "2026-12-21")).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    });

    it("de 19 minutos todavía ocupa", async () => {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      await lineaDe(m, (await reservaReciente({ creadaEn: haceMinutos(19) })).id);
      expect(horas(await consultar(m), "2026-12-21")).not.toContain("10:00");
    });

    it("de exactamente 20 minutos todavía ocupa", async () => {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      await lineaDe(m, (await reservaReciente({ creadaEn: haceMinutos(20) })).id);
      expect(horas(await consultar(m), "2026-12-21")).not.toContain("10:00");
    });

    it("la devuelta por un rechazo sigue ocupando aunque sea antigua", async () => {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      await lineaDe(m, (await reservaReciente({ creadaEn: haceMinutos(600), motivoRechazo: "No coincide" })).id);
      expect(horas(await consultar(m), "2026-12-21")).not.toContain("10:00");
    });

    it.each([
      ["pendiente de validación", { estado: "pendiente_validacion" as const, numeroOperacion: "OP-1" }],
      ["confirmada", { estado: "confirmada" as const, numeroOperacion: "OP-2" }],
    ])("una reserva %s sigue ocupando aunque sea antigua", async (_nombre, extra) => {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      await lineaDe(m, (await reservaReciente({ creadaEn: haceMinutos(600), ...extra })).id);
      expect(horas(await consultar(m), "2026-12-21")).not.toContain("10:00");
    });
  });

  it("una reserva de otra maquilladora no afecta", async () => {
    const m = await crearMaquilladora(db, { nombre: "Ana" });
    const otra = await crearMaquilladora(db, { nombre: "Bea" });
    await conLunes(m);
    await crearLinea(db, { reservaId: (await reservaReciente()).id, maquilladoraId: otra.id, inicio: local("2026-12-21", "10:00"), fin: local("2026-12-21", "11:00") });
    expect(horas(await consultar(m), "2026-12-21")).toContain("10:00");
  });

  it("un bloqueo de varios días vacía los intermedios", async () => {
    const m = await crearMaquilladora(db);
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
      await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: dia, horaInicio: "09:00", horaFin: "18:00" });
    }
    await db.insert(bloqueoAgenda).values({
      maquilladoraId: m.id,
      inicio: local("2026-12-24", "14:00"),
      fin: local("2026-12-26", "09:00"),
      motivo: "Vacaciones",
    });
    const dias = await consultar(m);
    expect(horas(dias, "2026-12-24").at(-1)).toBe("13:00");
    expect(horas(dias, "2026-12-25")).toEqual([]);
    expect(horas(dias, "2026-12-26")[0]).toBe("09:00");
  });

  it("un bloqueo de otra maquilladora no afecta", async () => {
    const m = await crearMaquilladora(db, { nombre: "Ana" });
    const otra = await crearMaquilladora(db, { nombre: "Bea" });
    await conLunes(m);
    await db.insert(bloqueoAgenda).values({
      maquilladoraId: otra.id,
      inicio: local("2026-12-21", "00:00"),
      fin: local("2026-12-22", "00:00"),
      motivo: "Ausencia",
    });
    expect(horas(await consultar(m), "2026-12-21")).toContain("09:00");
  });

  it("las reservas fuera de la ventana no cambian el resultado", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    const antes = await consultar(m);
    await crearLinea(db, { reservaId: (await reservaReciente()).id, maquilladoraId: m.id, inicio: local("2027-06-07", "10:00"), fin: local("2027-06-07", "11:00") });
    await crearLinea(db, { reservaId: (await reservaReciente()).id, maquilladoraId: m.id, inicio: local("2026-12-14", "10:00"), fin: local("2026-12-14", "11:00") });
    expect(await consultar(m)).toEqual(antes);
  });

  it("no ofrece lo que ya pasó hoy", async () => {
    const m = await crearMaquilladora(db);
    await conLunes(m);
    expect(horas(await consultar(m, new Date("2026-12-21T15:10:00Z")), "2026-12-21")).toEqual(["10:30", "11:00"]);
  });
});

describe("privacidad de la consulta", () => {
  it("solo selecciona inicio y fin de las reservas, nunca datos personales", async () => {
    const consultas: string[] = [];
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const dbConRegistro = drizzle(pool, { logger: { logQuery: (q) => consultas.push(q) } });
    try {
      const m = await crearMaquilladora(db);
      await conLunes(m);
      const reserva = await reservaReciente({ nombreContacto: "Clienta Secreta", telefonoContacto: "999000111" });
      await crearLinea(db, {
        reservaId: reserva.id,
        maquilladoraId: m.id,
        persona: "Persona Secreta",
        inicio: local("2026-12-21", "10:00"),
        fin: local("2026-12-21", "11:00"),
      });

      const dias = await consultarDisponibilidad(dbConRegistro, { servicio: SERVICIO, maquilladoraId: m.id, ahora: AHORA });

      expect(consultas.length).toBeGreaterThan(0);
      const todas = consultas.join("\n").toLowerCase();
      // Datos de contacto: ni se seleccionan ni se mencionan en ninguna parte de la consulta.
      for (const prohibido of ["nombre_contacto", "telefono_contacto", "persona", "token", "clave_idempotencia"]) {
        expect(todas).not.toContain(prohibido);
      }
      // La regla de vencimiento mira `numero_operacion` y `motivo_rechazo` solo para filtrar: lo que
      // cada consulta DEVUELVE (su lista de columnas) es únicamente inicio y fin, o las del horario.
      const columnasDeLineas = consultas
        .filter((q) => q.toLowerCase().includes('from "reserva_linea"'))
        .map((q) => q.slice(q.toLowerCase().indexOf("select") + 6, q.toLowerCase().indexOf(" from ")).trim());
      expect(columnasDeLineas).toEqual(['"reserva_linea"."inicio", "reserva_linea"."fin"']);
      expect(JSON.stringify(dias)).not.toMatch(/Secreta|999000111|OP-/);
    } finally {
      await pool.end();
    }
  });
});
