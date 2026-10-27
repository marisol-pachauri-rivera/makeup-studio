import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { rechazarReserva, validarReserva } from "@/lib/reservas-panel/transiciones";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { cancelarReservaDeLaClienta } from "./cancelar";

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

const AHORA = new Date("2026-12-21T15:00:00Z");
const HORA = 3_600_000;

/** Una reserva en validación con un turno a 48 horas. */
async function enValidacion() {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  const r = await crearReserva(db, { estado: "pendiente_validacion", numeroOperacion: "OP-1111", creadaEn: AHORA });
  await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: new Date(AHORA.getTime() + 48 * HORA),
    fin: new Date(AHORA.getTime() + 49 * HORA),
  });
  return r;
}

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
 * Una conexión retiene el bloqueo de fila de la reserva. Las operaciones reales se ponen en cola en el
 * orden indicado y, al soltar el bloqueo, Postgres las atiende en ese orden.
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
const lineasDe = (id: number) => db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, id));

describe("doble envío simultáneo", () => {
  it("la reserva se cancela una sola vez y ambas respuestas dicen cancelada", async () => {
    const r = await enValidacion();
    const cancelar = () => cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);

    const [a, b] = await enOrden<[unknown, unknown]>(r.id, [cancelar, cancelar]);

    expect(a).toEqual({ estado: "cancelada" });
    expect(b).toEqual({ estado: "cancelada" });
    expect(await filaDe(r.id)).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "clienta",
      estadoReembolso: "pendiente",
    });
    expect((await lineasDe(r.id)).every((l) => !l.activa)).toBe(true);
  });
});

describe("cancelar contra validar", () => {
  it.each(["cancelar", "validar"] as const)("si %s va primero, queda cancelada con reembolso pendiente", async (primero) => {
    const r = await enValidacion();
    const cancelar = () => cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    const validar = () => validarReserva(db, r.id);

    const [a, b] = await enOrden<[{ estado: string }, { estado: string }]>(
      r.id,
      primero === "cancelar" ? [cancelar, validar] : [validar, cancelar],
    );

    if (primero === "cancelar") {
      expect(a).toEqual({ estado: "cancelada" });
      expect(b).toEqual({ estado: "estado_distinto", actual: "cancelada" });
    } else {
      expect(a).toEqual({ estado: "aplicada" });
      expect(b).toEqual({ estado: "cancelada" });
    }
    // Nunca confirmada con las líneas inactivas.
    expect(await filaDe(r.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "clienta", estadoReembolso: "pendiente" });
    expect((await lineasDe(r.id)).every((l) => !l.activa)).toBe(true);
  });
});

describe("cancelar contra rechazar", () => {
  it.each(["cancelar", "rechazar"] as const)("si %s va primero, el estado final es coherente", async (primero) => {
    const r = await enValidacion();
    const cancelar = () => cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    const rechazar = () => rechazarReserva(db, r.id, "no aparece");

    const [a, b] = await enOrden<[{ estado: string }, { estado: string }]>(
      r.id,
      primero === "cancelar" ? [cancelar, rechazar] : [rechazar, cancelar],
    );

    const fila = await filaDe(r.id);
    expect(fila).toMatchObject({ estado: "cancelada", motivoCancelacion: "clienta" });
    expect((await lineasDe(r.id)).every((l) => !l.activa)).toBe(true);
    if (primero === "cancelar") {
      // Canceló con el pago informado: el reembolso queda pendiente y el rechazo ya no aplica.
      expect(a).toEqual({ estado: "cancelada" });
      expect(b).toEqual({ estado: "estado_distinto", actual: "cancelada" });
      expect(fila).toMatchObject({ estadoReembolso: "pendiente", numeroOperacion: "OP-1111" });
    } else {
      // El rechazo liberó el número y devolvió a pendiente de pago: sin pago que devolver.
      expect(a).toEqual({ estado: "aplicada" });
      expect(b).toEqual({ estado: "cancelada" });
      expect(fila).toMatchObject({ estadoReembolso: "no_aplica", numeroOperacion: null });
    }
  });

  it("repetido varias veces, el reembolso siempre coincide con el estado en que se canceló", async () => {
    for (let ronda = 0; ronda < 6; ronda++) {
      await limpiar();
      const r = await enValidacion();
      const cancelar = () => cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
      const rechazar = () => rechazarReserva(db, r.id, "no aparece");
      await enOrden<[unknown, unknown]>(r.id, ronda % 2 === 0 ? [cancelar, rechazar] : [rechazar, cancelar]);

      const fila = await filaDe(r.id);
      expect(fila.estado).toBe("cancelada");
      expect(fila.estadoReembolso).toBe(fila.numeroOperacion === null ? "no_aplica" : "pendiente");
    }
  });
});
