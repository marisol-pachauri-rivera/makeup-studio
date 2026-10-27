import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearReservaIndividual } from "@/lib/reserva/crear";
import type { SolicitudReserva } from "@/lib/reserva/esquemas";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { ingresarNumeroDeOperacion } from "./ingreso";

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

/** Una reserva vencida (30 minutos sin pagar) con su línea de 10:00 a 11:00, y la solicitud de quien la quiere. */
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

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];

describe("el ingreso del número contra la cancelación por vencimiento", () => {
  /**
   * Una conexión retiene el bloqueo de fila de la reserva vencida. Las dos operaciones reales se ponen en
   * cola en el orden indicado y, al soltar el bloqueo, Postgres las atiende en ese orden.
   */
  async function correr(primero: "ingreso" | "toma", vencidaId: number, solicitud: SolicitudReserva) {
    const retenedor = await pool.connect();
    try {
      await retenedor.query("begin");
      await retenedor.query("select id from reserva where id = $1 for update", [vencidaId]);

      const ingreso = () => ingresarNumeroDeOperacion(db, { token: vencida.token, numero: "OP-CARRERA" });
      const toma = () => crearReservaIndividual(db, solicitud, MADRUGADA);

      const orden = primero === "ingreso" ? [ingreso, toma] : [toma, ingreso];
      const promesas: Promise<unknown>[] = [];
      for (const [indice, arrancar] of orden.entries()) {
        promesas.push(arrancar());
        await esperarBloqueos(indice + 1);
      }

      await retenedor.query("rollback");
      const [a, b] = await Promise.all(promesas);
      return primero === "ingreso" ? { ingreso: a, toma: b } : { toma: a, ingreso: b };
    } finally {
      await retenedor.query("rollback").catch(() => undefined);
      retenedor.release();
    }
  }

  let vencida: Awaited<ReturnType<typeof vencidaYAspirante>>["vencida"];

  it("si el ingreso va primero: la reserva se conserva con su número y la otra clienta recibe horario no disponible", async () => {
    const mundo = await vencidaYAspirante();
    vencida = mundo.vencida;

    const r = await correr("ingreso", vencida.id, mundo.solicitud);

    expect(r.ingreso).toEqual({ estado: "registrado" });
    expect(r.toma).toEqual({ estado: "horario_no_disponible" });
    expect(await filaDe(vencida.id)).toMatchObject({
      estado: "pendiente_validacion",
      numeroOperacion: "OP-CARRERA",
      motivoCancelacion: null,
    });
    // La línea original sigue activa y la otra clienta no dejó nada a medias.
    expect((await db.select().from(reservaLinea)).map((l) => [l.reservaId, l.activa])).toEqual([[vencida.id, true]]);
    expect(await db.select().from(reserva)).toHaveLength(1);
  });

  it("si la toma del horario va primero: la vencida se cancela y el ingreso se rechaza como vencida", async () => {
    const mundo = await vencidaYAspirante();
    vencida = mundo.vencida;

    const r = await correr("toma", vencida.id, mundo.solicitud);

    expect(r.toma).toMatchObject({ estado: "creada" });
    expect(r.ingreso).toEqual({ estado: "vencida" });
    expect(await filaDe(vencida.id)).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "vencida",
      numeroOperacion: null,
    });
    const lineas = await db.select().from(reservaLinea);
    expect(lineas.filter((l) => l.activa)).toHaveLength(1);
    expect(lineas.filter((l) => l.activa)[0].reservaId).not.toBe(vencida.id);
  });

  it("repetido varias veces, siempre queda un estado coherente (nunca número y cancelación a la vez)", async () => {
    for (let ronda = 0; ronda < 6; ronda++) {
      await limpiar();
      const mundo = await vencidaYAspirante();
      vencida = mundo.vencida;
      const r = await correr(ronda % 2 === 0 ? "ingreso" : "toma", vencida.id, mundo.solicitud);

      const fila = await filaDe(vencida.id);
      const ganoElIngreso = fila.estado === "pendiente_validacion";
      expect(ganoElIngreso ? r.ingreso : r.toma).toBeTruthy();
      if (ganoElIngreso) {
        expect(fila.numeroOperacion).toBe("OP-CARRERA");
        expect(r.toma).toEqual({ estado: "horario_no_disponible" });
      } else {
        expect(fila).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida", numeroOperacion: null });
        expect(r.ingreso).toEqual({ estado: "vencida" });
      }
    }
  });
});

describe("dos reservas con el mismo número a la vez", () => {
  it("una queda en validación y la otra recibe número ya usado, sin estados a medias (x10)", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    for (let ronda = 0; ronda < 10; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);
      const reservas = [await crearReserva(db), await crearReserva(db)];
      let hora = 9;
      for (const r of reservas) {
        await crearLinea(db, {
          reservaId: r.id,
          maquilladoraId: m.id,
          servicioId: s.id,
          inicio: local(`${String(hora).padStart(2, "0")}:00`),
          fin: local(`${String(hora + 1).padStart(2, "0")}:00`),
        });
        hora += 2;
      }

      const resultados = await Promise.all(
        reservas.map((r) => ingresarNumeroDeOperacion(db, { token: r.token, numero: "OP-IGUAL" })),
      );

      expect(resultados.map((x) => x.estado).sort()).toEqual(["numero_usado", "registrado"]);
      const filas = await db.select().from(reserva).orderBy(reserva.id);
      expect(filas.filter((f) => f.estado === "pendiente_validacion")).toHaveLength(1);
      const perdedora = filas.find((f) => f.estado === "pendiente_pago");
      expect(perdedora?.numeroOperacion).toBeNull();
      expect(filas.filter((f) => f.numeroOperacion === "OP-IGUAL")).toHaveLength(1);
    }
  });
});
