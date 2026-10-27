import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { ingresarNumeroDeOperacion } from "@/lib/pago/ingreso";
import { crearReservaIndividual } from "@/lib/reserva/crear";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { cancelarReserva, rechazarReserva, validarReserva } from "./transiciones";

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

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const MADRUGADA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

type Extra = Partial<typeof reserva.$inferInsert>;

/** Una reserva con una línea de 10:00 a 11:00 en una maquilladora que trabaja los lunes de 09:00 a 13:00. */
async function mundo(extra: Extra) {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  const r = await crearReserva(db, { creadaEn: MADRUGADA, ...extra });
  await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: local("10:00"),
    fin: local("11:00"),
  });
  return { m, s, r };
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
 * orden indicado y, al soltar el bloqueo, Postgres las atiende en ese orden. Devuelve sus resultados
 * en el mismo orden.
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

describe("validar contra rechazar", () => {
  it.each(["validar", "rechazar"] as const)("si %s va primero, gana y la otra informa el estado nuevo", async (primero) => {
    const { r } = await mundo({ estado: "pendiente_validacion", numeroOperacion: "OP-1111" });
    const validar = () => validarReserva(db, r.id);
    const rechazar = () => rechazarReserva(db, r.id, "no aparece");

    const [a, b] = await enOrden<[unknown, unknown]>(r.id, primero === "validar" ? [validar, rechazar] : [rechazar, validar]);

    const fila = await filaDe(r.id);
    if (primero === "validar") {
      expect(a).toEqual({ estado: "aplicada" });
      expect(b).toEqual({ estado: "estado_distinto", actual: "confirmada" });
      expect(fila).toMatchObject({ estado: "confirmada", numeroOperacion: "OP-1111", motivoRechazo: null });
      expect(fila.validadaEn).toBeInstanceOf(Date);
    } else {
      expect(a).toEqual({ estado: "aplicada" });
      expect(b).toEqual({ estado: "estado_distinto", actual: "pendiente_pago" });
      expect(fila).toMatchObject({
        estado: "pendiente_pago",
        numeroOperacion: null,
        motivoRechazo: "no aparece",
        validadaEn: null,
      });
    }
    expect((await lineasDe(r.id)).every((l) => l.activa)).toBe(true);
  });

  it("repetido varias veces, nunca queda una reserva mezclada", async () => {
    for (let ronda = 0; ronda < 6; ronda++) {
      await limpiar();
      const { r } = await mundo({ estado: "pendiente_validacion", numeroOperacion: "OP-1111" });
      const validar = () => validarReserva(db, r.id);
      const rechazar = () => rechazarReserva(db, r.id, "no aparece");
      const [a, b] = await enOrden<[{ estado: string }, { estado: string }]>(
        r.id,
        ronda % 2 === 0 ? [validar, rechazar] : [rechazar, validar],
      );

      expect([a.estado, b.estado].sort()).toEqual(["aplicada", "estado_distinto"]);
      const fila = await filaDe(r.id);
      expect(fila.estado === "confirmada" ? fila.numeroOperacion : fila.numeroOperacion === null).toBeTruthy();
      expect(fila.estado === "confirmada" ? fila.motivoRechazo === null : fila.validadaEn === null).toBe(true);
    }
  });
});

describe("doble validación", () => {
  it("la segunda informa que ya estaba confirmada y validada_en no se pisa", async () => {
    const { r } = await mundo({ estado: "pendiente_validacion", numeroOperacion: "OP-1111" });

    const [a, b] = await enOrden<[unknown, unknown]>(r.id, [() => validarReserva(db, r.id), () => validarReserva(db, r.id)]);

    expect(a).toEqual({ estado: "aplicada" });
    expect(b).toEqual({ estado: "ya_aplicada", actual: "confirmada" });

    const primera = (await filaDe(r.id)).validadaEn;
    expect(primera).toBeInstanceOf(Date);
    await new Promise((x) => setTimeout(x, 20));
    expect(await validarReserva(db, r.id)).toEqual({ estado: "ya_aplicada", actual: "confirmada" });
    expect((await filaDe(r.id)).validadaEn).toEqual(primera);
  });
});

describe("cancelar contra el ingreso del número de la clienta", () => {
  it.each(["cancelar", "ingresar"] as const)("si %s va primero, el estado final es coherente", async (primero) => {
    const { r } = await mundo({});
    const cancelar = () => cancelarReserva(db, r.id);
    const ingresar = () => ingresarNumeroDeOperacion(db, { token: r.token, numero: "OP-CARRERA" });

    const [a, b] = await enOrden<[{ estado: string }, { estado: string }]>(
      r.id,
      primero === "cancelar" ? [cancelar, ingresar] : [ingresar, cancelar],
    );

    const fila = await filaDe(r.id);
    const lineas = await lineasDe(r.id);
    if (primero === "cancelar") {
      expect(a).toEqual({ estado: "aplicada" });
      expect(b).toEqual({ estado: "cancelada" });
      expect(fila).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio", numeroOperacion: null });
    } else {
      // El número se guardó y enseguida el studio canceló: cancelada, con el número que ya tenía.
      expect(a).toEqual({ estado: "registrado" });
      expect(b).toEqual({ estado: "aplicada" });
      expect(fila).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio", numeroOperacion: "OP-CARRERA" });
    }
    expect(lineas.every((l) => !l.activa)).toBe(true);
  });
});

describe("cancelar contra la cancelación por vencimiento", () => {
  // Una reserva vencida (30 minutos sin pagar) y la solicitud de otra clienta por su mismo horario.
  async function vencidaYAspirante() {
    const e = await mundo({ creadaEn: new Date(MADRUGADA.getTime() - 30 * 60_000) });
    const solicitud = {
      clave: "00000000-0000-4000-8000-0000000000cc",
      servicioId: e.s.id,
      maquilladoraId: e.m.id,
      inicio: local("10:00"),
      nombre: "Clienta Nueva",
      telefono: "999111222",
    };
    return { vencida: e.r, solicitud };
  }

  it("si el studio cancela primero: la reserva queda cancelada por el studio, una sola vez, y el horario libre", async () => {
    const { vencida, solicitud } = await vencidaYAspirante();

    const [studio, toma] = await enOrden<[unknown, { estado: string }]>(vencida.id, [
      () => cancelarReserva(db, vencida.id),
      () => crearReservaIndividual(db, solicitud, MADRUGADA),
    ]);

    expect(studio).toEqual({ estado: "aplicada" });
    // La otra clienta ya había leído la reserva como vigente: no pisa la cancelación y deshace lo suyo.
    expect(toma).toEqual({ estado: "horario_no_disponible" });
    expect(await filaDe(vencida.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio" });
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.activa, true)))).toEqual([]);
    expect(await db.select().from(reserva)).toHaveLength(1);
  });

  it("si la toma va primero: se cancela por vencimiento una sola vez y la cancelación del studio no la pisa", async () => {
    const { vencida, solicitud } = await vencidaYAspirante();

    const [toma, studio] = await enOrden<[{ estado: string }, unknown]>(vencida.id, [
      () => crearReservaIndividual(db, solicitud, MADRUGADA),
      () => cancelarReserva(db, vencida.id),
    ]);

    expect(toma).toMatchObject({ estado: "creada" });
    expect(studio).toEqual({ estado: "ya_aplicada", actual: "cancelada" });
    expect(await filaDe(vencida.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
    const activas = await db.select().from(reservaLinea).where(eq(reservaLinea.activa, true));
    expect(activas).toHaveLength(1);
    expect(activas[0].reservaId).not.toBe(vencida.id);
  });
});
