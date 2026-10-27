import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { crearReservaIndividual } from "./crear";
import type { SolicitudReserva } from "./esquemas";
import { HorarioOcupado, insertarLineaLiberandoVencidas } from "./vencimiento";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima, así que todo el día queda por delante.
const MADRUGADA = new Date("2026-12-21T05:00:00Z");
const antes = (minutos: number) => new Date(MADRUGADA.getTime() - minutos * 60_000);
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

let contador = 0;
const clave = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`;

type Escenario = { m: { id: number }; s: { id: number } };

/** Una maquilladora que trabaja los lunes de 09:00 a 13:00 y un servicio de `duracionMinutos`. */
async function escenario(duracionMinutos = 60): Promise<Escenario> {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db, { duracionMinutos, precio: "120.00" });
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  return { m, s };
}

/** Una reserva con su línea en `[desde, hasta)`, creada hace `minutos` respecto de MADRUGADA. */
async function reservaConLinea(
  e: Escenario,
  desde: string,
  hasta: string,
  extra: Parameters<typeof crearReserva>[1] & { minutos?: number } = {},
) {
  const { minutos = 30, ...resto } = extra;
  const r = await crearReserva(db, { creadaEn: antes(minutos), ...resto });
  const linea = await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: e.m.id,
    servicioId: e.s.id,
    inicio: local(desde),
    fin: local(hasta),
  });
  return { r, linea };
}

const solicitud = (e: Escenario, extra: Partial<SolicitudReserva> = {}): SolicitudReserva => ({
  clave: clave(),
  servicioId: e.s.id,
  maquilladoraId: e.m.id,
  inicio: local("10:00"),
  nombre: "Clienta Nueva",
  telefono: "999111222",
  ...extra,
});

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const lineasDe = (id: number) => db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, id));

describe("reservar sobre el horario de una vencida", () => {
  it("la cancela con motivo vencida, libera todas sus líneas y crea la nueva", async () => {
    const e = await escenario();
    const { r: vencida } = await reservaConLinea(e, "10:00", "11:00");

    const resultado = await crearReservaIndividual(db, solicitud(e), MADRUGADA);

    expect(resultado).toMatchObject({ estado: "creada", repetida: false });
    expect(await filaDe(vencida.id)).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "vencida",
      numeroOperacion: null,
    });
    expect((await lineasDe(vencida.id)).map((l) => l.activa)).toEqual([false]);

    const nuevas = await db.select().from(reserva).where(eq(reserva.estado, "pendiente_pago"));
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0]).toMatchObject({ montoTotal: "120.00", nombreContacto: "Clienta Nueva" });
    expect((await lineasDe(nuevas[0].id)).map((l) => l.activa)).toEqual([true]);
  });

  it("cancela la reserva completa si la vencida tiene varias líneas", async () => {
    const e = await escenario();
    const { r: vencida } = await reservaConLinea(e, "10:00", "11:00");
    await crearLinea(db, {
      reservaId: vencida.id,
      maquilladoraId: e.m.id,
      servicioId: e.s.id,
      inicio: local("12:00"),
      fin: local("13:00"),
    });

    await crearReservaIndividual(db, solicitud(e), MADRUGADA);

    expect((await filaDe(vencida.id)).estado).toBe("cancelada");
    expect((await lineasDe(vencida.id)).map((l) => l.activa)).toEqual([false, false]);
  });

  it("cancela las dos vencidas cuando el turno nuevo se solapa con ambas", async () => {
    const e = await escenario(120);
    const { r: a } = await reservaConLinea(e, "10:00", "11:00");
    const { r: b } = await reservaConLinea(e, "11:00", "12:00");

    const resultado = await crearReservaIndividual(db, solicitud(e), MADRUGADA);

    expect(resultado.estado).toBe("creada");
    expect(await filaDe(a.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
    expect(await filaDe(b.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
  });

  it("una reserva de 19 minutos todavía ocupa: no se cancela y la nueva recibe horario no disponible", async () => {
    const e = await escenario();
    const { r } = await reservaConLinea(e, "10:00", "11:00", { minutos: 19 });

    expect((await crearReservaIndividual(db, solicitud(e), MADRUGADA)).estado).toBe("horario_no_disponible");
    expect((await filaDe(r.id)).estado).toBe("pendiente_pago");
    expect(await db.select().from(reserva)).toHaveLength(1);
  });

  it("una reserva devuelta por rechazo no se cancela aunque sea antigua", async () => {
    const e = await escenario();
    const { r } = await reservaConLinea(e, "10:00", "11:00", { minutos: 600, motivoRechazo: "No coincide" });

    expect((await crearReservaIndividual(db, solicitud(e), MADRUGADA)).estado).toBe("horario_no_disponible");
    expect((await filaDe(r.id)).estado).toBe("pendiente_pago");
    expect((await lineasDe(r.id)).map((l) => l.activa)).toEqual([true]);
  });

  it("una reserva en validación no se cancela aunque sea antigua", async () => {
    const e = await escenario();
    const { r } = await reservaConLinea(e, "10:00", "11:00", {
      minutos: 600,
      estado: "pendiente_validacion",
      numeroOperacion: "OP-1",
    });

    expect((await crearReservaIndividual(db, solicitud(e), MADRUGADA)).estado).toBe("horario_no_disponible");
    expect((await filaDe(r.id)).estado).toBe("pendiente_validacion");
  });

  it("la idempotencia sigue intacta: reenviar la clave devuelve la misma reserva", async () => {
    const e = await escenario();
    await reservaConLinea(e, "10:00", "11:00");
    const s = solicitud(e);

    const primera = await crearReservaIndividual(db, s, MADRUGADA);
    const segunda = await crearReservaIndividual(db, s, MADRUGADA);

    if (primera.estado !== "creada" || segunda.estado !== "creada") throw new Error("reserva esperada");
    expect(segunda).toMatchObject({ repetida: true, token: primera.token });
    expect(await db.select().from(reserva).where(eq(reserva.estado, "pendiente_pago"))).toHaveLength(1);
  });

  it("no hay tope de reservas sin pagar: varias de la misma persona se crean", async () => {
    const e = await escenario();
    for (const hora of ["09:00", "10:00", "11:00", "12:00"]) {
      const r = await crearReservaIndividual(db, solicitud(e, { inicio: local(hora), telefono: "999111222" }), MADRUGADA);
      expect(r.estado).toBe("creada");
    }
    expect(await db.select().from(reserva)).toHaveLength(4);
  });
});

describe("insertarLineaLiberandoVencidas dentro de una transacción", () => {
  const valoresNuevos = (e: Escenario, reservaId: number, desde: string, hasta: string) => ({
    reservaId,
    persona: "Nueva",
    servicioId: e.s.id,
    maquilladoraId: e.m.id,
    inicio: local(desde),
    fin: local(hasta),
    precio: "120.00",
  });

  it("con una vencida y una vigente a la vez devuelve ocupado, y al deshacer no queda nada cancelado", async () => {
    const e = await escenario(120);
    const { r: vencida } = await reservaConLinea(e, "10:00", "11:00");
    const { r: vigente } = await reservaConLinea(e, "11:00", "12:00", { minutos: 5 });
    const nueva = await crearReserva(db, { creadaEn: MADRUGADA });

    await expect(
      db.transaction(async (tx) => {
        const r = await insertarLineaLiberandoVencidas(tx, valoresNuevos(e, nueva.id, "10:00", "12:00"), MADRUGADA);
        expect(r).toBe("ocupado");
        throw new HorarioOcupado();
      }),
    ).rejects.toBeInstanceOf(HorarioOcupado);

    expect((await filaDe(vencida.id)).estado).toBe("pendiente_pago");
    expect((await lineasDe(vencida.id)).map((l) => l.activa)).toEqual([true]);
    expect((await filaDe(vigente.id)).estado).toBe("pendiente_pago");
    expect(await lineasDe(nueva.id)).toHaveLength(0);
  });

  it("todo o nada: si falla algo después de cancelar la vencida, la vencida sigue sin cancelar", async () => {
    const e = await escenario();
    const { r: vencida } = await reservaConLinea(e, "10:00", "11:00");
    const nueva = await crearReserva(db, { creadaEn: MADRUGADA });

    await expect(
      db.transaction(async (tx) => {
        const r = await insertarLineaLiberandoVencidas(tx, valoresNuevos(e, nueva.id, "10:00", "11:00"), MADRUGADA);
        expect(r).toBe("insertada");
        // Dentro de la transacción ya se canceló la vencida y se insertó la línea nueva (se lee con `tx`:
        // desde fuera todavía no se ve nada, porque no se confirmó)...
        const [dentro] = await tx.select().from(reserva).where(eq(reserva.id, vencida.id));
        expect(dentro.estado).toBe("cancelada");
        throw new Error("falla posterior");
      }),
    ).rejects.toThrow("falla posterior");

    // ...y al deshacerse, todo vuelve a como estaba.
    expect(await filaDe(vencida.id)).toMatchObject({ estado: "pendiente_pago", motivoCancelacion: null });
    expect((await lineasDe(vencida.id)).map((l) => l.activa)).toEqual([true]);
    expect(await lineasDe(nueva.id)).toHaveLength(0);
  });

  it("sin choque inserta directamente y no toca ninguna reserva", async () => {
    const e = await escenario();
    const otra = await reservaConLinea(e, "12:00", "13:00");
    const nueva = await crearReserva(db, { creadaEn: MADRUGADA });

    const r = await db.transaction((tx) =>
      insertarLineaLiberandoVencidas(tx, valoresNuevos(e, nueva.id, "10:00", "11:00"), MADRUGADA),
    );

    expect(r).toBe("insertada");
    expect((await filaDe(otra.r.id)).estado).toBe("pendiente_pago");
  });
});

describe("dos reservas simultáneas por el horario de una vencida", () => {
  it("una gana, la otra recibe horario no disponible y la vencida se cancela una sola vez", async () => {
    const e = await escenario();
    for (let ronda = 0; ronda < 10; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);
      const { r: vencida } = await reservaConLinea(e, "10:00", "11:00");

      const resultados = await Promise.all([
        crearReservaIndividual(db, solicitud(e, { nombre: "Clienta A" }), MADRUGADA),
        crearReservaIndividual(db, solicitud(e, { nombre: "Clienta B" }), MADRUGADA),
      ]);

      expect(resultados.map((r) => r.estado).sort()).toEqual(["creada", "horario_no_disponible"]);
      expect(await filaDe(vencida.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
      // La vencida (con su línea inactiva) y la ganadora (con una línea activa): sin filas a medias.
      expect(await db.select().from(reserva)).toHaveLength(2);
      const lineas = await db.select().from(reservaLinea);
      expect(lineas).toHaveLength(2);
      expect(lineas.filter((l) => l.activa)).toHaveLength(1);
    }
  });
});
