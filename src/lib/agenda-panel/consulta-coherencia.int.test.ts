import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo } from "@/db/schema";
import { aPartesLocales, deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { obtenerAgendaDelDia } from "./consulta";

const { db, cerrar } = crearDbDePrueba();
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
afterAll(async () => {
  await pool.end();
  await cerrar();
});

// La prueba de concurrencia confirma de verdad con otra conexión: se limpia antes y después.
const limpiar = () =>
  db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
beforeEach(limpiar);
afterEach(limpiar);

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const DIA = "2026-12-21";
const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`${DIA}T${hora}`) as Date;
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);

async function conLunes() {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db, { duracionMinutos: 60 });
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "12:00" });
  return { m, s };
}

const horasLibres = async (m: { id: number }) =>
  (await consultarDisponibilidad(db, { servicio: { duracionMinutos: 60 }, maquilladoraId: m.id, ahora: AHORA }))
    .filter((d) => d.fecha === DIA)
    .flatMap((d) => d.inicios.map((i) => aPartesLocales(i).hora));

describe("la agenda y la disponibilidad pública no discrepan", () => {
  it("una reserva vencida figura con vencida = true y el mismo turno aparece libre en la disponibilidad", async () => {
    const { m, s } = await conLunes();
    const r = await crearReserva(db, { creadaEn: hace(30) });
    await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: local("10:00"), fin: local("11:00") });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos).toHaveLength(1);
    expect(turnos[0].vencida).toBe(true);
    expect(await horasLibres(m)).toContain("10:00");
  });

  it("una reserva reciente figura vigente y su turno NO aparece libre", async () => {
    const { m, s } = await conLunes();
    const r = await crearReserva(db, { creadaEn: hace(5) });
    await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: local("10:00"), fin: local("11:00") });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos[0].vencida).toBe(false);
    expect(await horasLibres(m)).not.toContain("10:00");
  });

  it("una reserva devuelta a pendiente de pago por un rechazo no es vencida y su turno sigue ocupado", async () => {
    const { m, s } = await conLunes();
    const r = await crearReserva(db, { creadaEn: hace(60 * 24 * 3), motivoRechazo: "no aparece" });
    await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: local("10:00"), fin: local("11:00") });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos[0].vencida).toBe(false);
    expect(await horasLibres(m)).not.toContain("10:00");
  });
});

describe("lectura frente a una escritura sin confirmar", () => {
  it("no ve un alta que otra transacción aún no confirmó y no queda bloqueada", async () => {
    const { m, s } = await conLunes();
    const otra = await pool.connect();
    try {
      await otra.query("begin");
      const { rows } = await otra.query<{ id: number }>(
        `insert into reserva (nombre_contacto, telefono_contacto, monto_total, creada_en) values ('Sin confirmar', '999111222', 120, $1) returning id`,
        [AHORA],
      );
      await otra.query(
        `insert into reserva_linea (reserva_id, persona, servicio_id, maquilladora_id, inicio, fin, precio) values ($1, 'Sin confirmar', $2, $3, $4, $5, 120)`,
        [rows[0].id, s.id, m.id, local("10:00"), local("11:00")],
      );

      // Con la transacción abierta, la lectura responde enseguida y sin el alta.
      const agenda = await Promise.race([
        obtenerAgendaDelDia(db, DIA, AHORA),
        new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("la lectura quedó bloqueada")), 3000)),
      ]);

      expect(agenda.turnos).toEqual([]);
    } finally {
      await otra.query("rollback").catch(() => undefined);
      otra.release();
    }
  });
});
