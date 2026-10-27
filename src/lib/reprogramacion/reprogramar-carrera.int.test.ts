import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { ingresarNumeroDeOperacion } from "@/lib/pago/ingreso";
import { cancelarReserva } from "@/lib/reservas-panel/transiciones";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { reprogramarTurno, type SolicitudReprogramacion } from "./reprogramar";

const { db, cerrar } = crearDbDePrueba();
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
afterAll(async () => {
  await pool.end();
  await cerrar();
});

// Estas pruebas confirman de verdad con varias conexiones: se limpia antes y después.
const limpiar = () =>
  db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
beforeEach(limpiar);
afterEach(limpiar);

// 2026-12-21 es lunes; los turnos son el lunes 28.
const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`2026-12-28T${hora}`) as Date;

/** Dos maquilladoras que trabajan los lunes de 09:00 a 18:00 y un servicio de 60 minutos. */
async function base() {
  const m = await crearMaquilladora(db, { nombre: "Ana" });
  const otra = await crearMaquilladora(db, { nombre: "Bea" });
  const s = await crearServicio(db, { precio: "120.00", duracionMinutos: 60 });
  for (const id of [m.id, otra.id]) {
    await db.insert(horarioTrabajo).values({ maquilladoraId: id, diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
  }
  return { m, otra, s };
}
type Base = Awaited<ReturnType<typeof base>>;

let contador = 0;
/** Una reserva confirmada con un turno de Ana a la hora indicada. */
async function confirmadaEn(b: Base, desde: string, hasta: string) {
  const r = await crearReserva(db, {
    estado: "confirmada",
    numeroOperacion: `OP-${String(++contador).padStart(4, "0")}`,
    creadaEn: AHORA,
  });
  const linea = await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: b.m.id,
    servicioId: b.s.id,
    inicio: local(desde),
    fin: local(hasta),
  });
  return { r, linea };
}

/** Pide mover el turno `{ r, linea }` (visto en `desde`, con Ana) al horario `a` con Bea. */
const pedir = (
  b: Base,
  t: { r: { token: string }; linea: { id: number } },
  desde: string,
  a: string,
): SolicitudReprogramacion => ({
  token: t.r.token,
  lineaId: t.linea.id,
  maquilladoraId: b.otra.id,
  inicio: local(a),
  inicioVisto: local(desde),
  maquilladoraVistaId: b.m.id,
});

/** Espera a que haya al menos `n` consultas bloqueadas esperando un bloqueo de fila. */
async function esperarBloqueos(n: number, limiteMs = 5000) {
  const hasta = Date.now() + limiteMs;
  while (Date.now() < hasta) {
    const { rows } = await db.execute<{ n: string }>(
      sql`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (Number(rows[0].n) >= n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`No hay ${n} consulta(s) esperando un bloqueo: la carrera no se produjo`);
}

/**
 * Una conexión retiene el bloqueo de fila de la reserva `reservaId`. Las operaciones reales se ponen en
 * cola en el orden indicado y, al soltar el bloqueo, Postgres las atiende en ese orden.
 */
async function enOrden<T extends unknown[]>(
  reservaId: number,
  operaciones: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  const retenedor = await pool.connect();
  try {
    await retenedor.query("begin");
    await retenedor.query("select id from reserva where id = $1 for update", [reservaId]);

    const promesas: Promise<unknown>[] = [];
    for (const [indice, arrancar] of (operaciones as (() => Promise<unknown>)[]).entries()) {
      promesas.push(arrancar());
      await esperarBloqueos(indice + 1);
    }

    await retenedor.query("rollback");
    return (await Promise.all(promesas)) as T;
  } finally {
    await retenedor.query("rollback").catch(() => undefined);
    retenedor.release();
  }
}

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const lineaDe = async (id: number) => (await db.select().from(reservaLinea).where(eq(reservaLinea.id, id)))[0];

describe("dos reprogramaciones al mismo horario", () => {
  it("una lo obtiene y la otra recibe horario no disponible con su turno intacto (x8)", async () => {
    for (let ronda = 0; ronda < 8; ronda++) {
      await limpiar();
      const b = await base();
      const a = await confirmadaEn(b, "10:00", "11:00");
      const c = await confirmadaEn(b, "13:00", "14:00");

      const [ra, rc] = await Promise.all([
        reprogramarTurno(db, pedir(b, a, "10:00", "15:00"), AHORA),
        reprogramarTurno(db, pedir(b, c, "13:00", "15:00"), AHORA),
      ]);

      expect([ra.estado, rc.estado].sort()).toEqual(["horario_no_disponible", "reprogramada"]);
      const [la, lc] = [await lineaDe(a.linea.id), await lineaDe(c.linea.id)];
      const ganadora = ra.estado === "reprogramada" ? la : lc;
      const perdedora = ra.estado === "reprogramada" ? lc : la;
      expect(ganadora).toMatchObject({ maquilladoraId: b.otra.id, inicio: local("15:00"), activa: true });
      expect(perdedora).toMatchObject({
        maquilladoraId: b.m.id,
        inicio: ra.estado === "reprogramada" ? local("13:00") : local("10:00"),
        activa: true,
      });
    }
  });
});

describe("reprogramar contra una cancelación de la reserva", () => {
  it.each(["reprogramar", "cancelar"] as const)("si %s va primero, queda cancelada con líneas inactivas o movida y luego cancelada", async (primero) => {
    const b = await base();
    const t = await confirmadaEn(b, "10:00", "11:00");
    const reprogramar = () => reprogramarTurno(db, pedir(b, t, "10:00", "12:00"), AHORA);
    const cancelar = () => cancelarReserva(db, t.r.id);

    const [a, c] = await enOrden<[{ estado: string }, { estado: string }]>(
      t.r.id,
      primero === "reprogramar" ? [reprogramar, cancelar] : [cancelar, reprogramar],
    );

    expect(await filaDe(t.r.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio" });
    const linea = await lineaDe(t.linea.id);
    expect(linea.activa).toBe(false);
    if (primero === "reprogramar") {
      // Se movió y después el studio canceló: la línea inactiva queda en su horario nuevo.
      expect(a).toEqual({ estado: "reprogramada", repetida: false });
      expect(c).toEqual({ estado: "aplicada" });
      expect(linea).toMatchObject({ maquilladoraId: b.otra.id, inicio: local("12:00") });
    } else {
      // La cancelación ganó: no se movió nada.
      expect(a).toEqual({ estado: "aplicada" });
      expect(c).toEqual({ estado: "no_reprogramable" });
      expect(linea).toMatchObject({ maquilladoraId: b.m.id, inicio: local("10:00") });
    }
  });
});

describe("reprogramar sobre una reserva vencida contra su ingreso de número", () => {
  /** Un turno confirmado de Ana a las 10:00 y una reserva vencida (30 min sin pagar) de Bea a las 12:00. */
  async function conVencida() {
    const b = await base();
    const t = await confirmadaEn(b, "10:00", "11:00");
    const vencida = await crearReserva(db, { creadaEn: new Date(AHORA.getTime() - 30 * 60_000) });
    await crearLinea(db, {
      reservaId: vencida.id,
      maquilladoraId: b.otra.id,
      servicioId: b.s.id,
      inicio: local("12:00"),
      fin: local("13:00"),
    });
    return { b, t, vencida };
  }

  it("si el ingreso va primero: la vencida se conserva y la reprogramación se rechaza con el turno intacto", async () => {
    const { b, t, vencida } = await conVencida();

    const [ingreso, mover] = await enOrden<[{ estado: string }, { estado: string }]>(vencida.id, [
      () => ingresarNumeroDeOperacion(db, { token: vencida.token, numero: "OP-CARRERA" }),
      () => reprogramarTurno(db, pedir(b, t, "10:00", "12:00"), AHORA),
    ]);

    expect(ingreso).toEqual({ estado: "registrado" });
    expect(mover).toEqual({ estado: "horario_no_disponible" });
    expect(await filaDe(vencida.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-CARRERA" });
    expect(await lineaDe(t.linea.id)).toMatchObject({ maquilladoraId: b.m.id, inicio: local("10:00"), activa: true });
  });

  it("si la reprogramación va primero: la vencida se cancela y el ingreso se rechaza como vencida", async () => {
    const { b, t, vencida } = await conVencida();

    const [mover, ingreso] = await enOrden<[{ estado: string }, { estado: string }]>(vencida.id, [
      () => reprogramarTurno(db, pedir(b, t, "10:00", "12:00"), AHORA),
      () => ingresarNumeroDeOperacion(db, { token: vencida.token, numero: "OP-CARRERA" }),
    ]);

    expect(mover).toEqual({ estado: "reprogramada", repetida: false });
    expect(ingreso).toEqual({ estado: "vencida" });
    expect(await filaDe(vencida.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida", numeroOperacion: null });
    expect(await lineaDe(t.linea.id)).toMatchObject({ maquilladoraId: b.otra.id, inicio: local("12:00"), activa: true });
  });
});
