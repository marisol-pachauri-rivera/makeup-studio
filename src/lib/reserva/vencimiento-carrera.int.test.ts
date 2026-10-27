import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { crearReservaIndividual } from "./crear";
import type { SolicitudReserva } from "./esquemas";

const { db, cerrar } = crearDbDePrueba();
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
afterAll(async () => {
  await pool.end();
  await cerrar();
});

// Estas pruebas confirman de verdad con dos conexiones, así que el estado se limpia a mano. Se limpia
// también ANTES: cuentan filas globales y no deben heredar lo que dejó otro archivo de pruebas.
const limpiar = () =>
  db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
beforeEach(limpiar);
afterEach(limpiar);

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const MADRUGADA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

/** Una reserva vencida (30 minutos sin pagar) con su línea de 10:00 a 11:00, y la solicitud de la clienta que la quiere. */
async function vencidaYAspirante() {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db, { precio: "120.00" });
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  const vencida = await crearReserva(db, { creadaEn: new Date(MADRUGADA.getTime() - 30 * 60_000) });
  await crearLinea(db, {
    reservaId: vencida.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: local("10:00"),
    fin: local("11:00"),
  });
  const solicitud: SolicitudReserva = {
    clave: "00000000-0000-4000-8000-0000000000aa",
    servicioId: s.id,
    maquilladoraId: m.id,
    inicio: local("10:00"),
    nombre: "Clienta Nueva",
    telefono: "999111222",
  };
  return { vencida, solicitud };
}

/** Lo que hará el ingreso del número (ítem #10): condicionado a que la reserva siga pendiente de pago. */
const INGRESO_DEL_NUMERO = `update reserva set numero_operacion = 'OP-9', estado = 'pendiente_validacion'
  where id = $1 and estado = 'pendiente_pago'`;

/** Espera a que alguna consulta esté bloqueada esperando un bloqueo de fila. */
async function esperarUnBloqueo(limiteMs = 5000) {
  const hasta = Date.now() + limiteMs;
  while (Date.now() < hasta) {
    const { rows } = await db.execute<{ n: string }>(
      sql`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (Number(rows[0].n) > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Ninguna consulta quedó esperando un bloqueo: la carrera no se produjo");
}

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];

describe("carrera contra el ingreso del número de operación", () => {
  it("si el número se confirma justo antes de cancelar, la original se conserva y la nueva recibe horario no disponible", async () => {
    const { vencida, solicitud } = await vencidaYAspirante();

    // Conexión 1: la clienta original ingresa su número, pero todavía no confirma la transacción.
    const conexion = await pool.connect();
    try {
      await conexion.query("begin");
      expect((await conexion.query(INGRESO_DEL_NUMERO, [vencida.id])).rowCount).toBe(1);

      // Conexión 2: otra clienta quiere el horario. Ve la reserva todavía como vencida, intenta
      // cancelarla y se queda esperando el bloqueo de esa fila.
      const nueva = crearReservaIndividual(db, solicitud, MADRUGADA);
      await esperarUnBloqueo();

      await conexion.query("commit");
      const resultado = await nueva;

      expect(resultado).toEqual({ estado: "horario_no_disponible" });
    } finally {
      await conexion.query("rollback").catch(() => undefined);
      conexion.release();
    }

    // La reserva original quedó con su número y su línea activa; la nueva no dejó nada a medias.
    expect(await filaDe(vencida.id)).toMatchObject({
      estado: "pendiente_validacion",
      numeroOperacion: "OP-9",
      motivoCancelacion: null,
    });
    const lineas = await db.select().from(reservaLinea);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ reservaId: vencida.id, activa: true });
    expect(await db.select().from(reserva)).toHaveLength(1);
  });

  it("si la cancelación por vencimiento se confirma primero, el ingreso condicionado del número no reactiva la reserva", async () => {
    const { vencida, solicitud } = await vencidaYAspirante();

    expect((await crearReservaIndividual(db, solicitud, MADRUGADA)).estado).toBe("creada");

    const conexion = await pool.connect();
    try {
      expect((await conexion.query(INGRESO_DEL_NUMERO, [vencida.id])).rowCount).toBe(0);
    } finally {
      conexion.release();
    }

    expect(await filaDe(vencida.id)).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "vencida",
      numeroOperacion: null,
    });
  });

  it("si nadie tomó el horario, la reserva sigue pendiente de pago y el ingreso del número funciona", async () => {
    const { vencida } = await vencidaYAspirante();

    const conexion = await pool.connect();
    try {
      expect((await conexion.query(INGRESO_DEL_NUMERO, [vencida.id])).rowCount).toBe(1);
    } finally {
      conexion.release();
    }

    expect(await filaDe(vencida.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-9" });
  });
});
