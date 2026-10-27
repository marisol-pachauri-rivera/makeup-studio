import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { listarReservas, obtenerReservaParaPanel } from "./consultas";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const AHORA = new Date("2026-12-21T05:00:00Z");
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

type Extra = Partial<typeof reserva.$inferInsert>;

/** Una reserva con una línea; el horario se reparte por maquilladora para que nunca choquen. */
async function reservaConLinea(extra: Extra, inicio = "10:00", fin = "11:00") {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  const r = await crearReserva(db, extra);
  await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: local(inicio), fin: local(fin) });
  return r;
}

const validacion = (extra: Extra = {}): Extra => ({
  estado: "pendiente_validacion",
  numeroOperacion: `OP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  ...extra,
});

const lista = (extra: { pagina?: number; estado?: "pendiente_pago" | "pendiente_validacion" | "confirmada" | "cancelada" } = {}) =>
  listarReservas(db, { pagina: 1, ahora: AHORA, ...extra });

describe("listarReservas: orden", () => {
  it("las pendientes de validación van primero, aunque haya una confirmada más reciente", async () => {
    const confirmada = await reservaConLinea(validacion({ estado: "confirmada", creadaEn: hace(1) }));
    const enValidacion = await reservaConLinea(validacion({ creadaEn: hace(600) }));

    const { filas } = await lista();

    expect(filas.map((f) => f.id)).toEqual([enValidacion.id, confirmada.id]);
  });

  it("entre las pendientes de validación, la más antigua arriba", async () => {
    const reciente = await reservaConLinea(validacion({ creadaEn: hace(10) }));
    const antigua = await reservaConLinea(validacion({ creadaEn: hace(500) }));
    const media = await reservaConLinea(validacion({ creadaEn: hace(100) }));

    const { filas } = await lista();

    expect(filas.map((f) => f.id)).toEqual([antigua.id, media.id, reciente.id]);
  });

  it("las demás van de la más reciente a la más antigua y con la misma fecha desempata el identificador", async () => {
    const vieja = await reservaConLinea({ creadaEn: hace(300) });
    const nueva = await reservaConLinea({ creadaEn: hace(5) });
    const gemelaA = await reservaConLinea({ creadaEn: hace(60) });
    const gemelaB = await reservaConLinea({ creadaEn: hace(60) });

    const { filas } = await lista();

    expect(filas.map((f) => f.id)).toEqual([nueva.id, gemelaB.id, gemelaA.id, vieja.id]);
  });
});

describe("listarReservas: paginación y filtro", () => {
  it("30 reservas dan 25 en la primera página y 5 en la segunda", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    for (let i = 0; i < 30; i++) {
      const r = await crearReserva(db, { creadaEn: hace(i + 1) });
      await crearLinea(db, {
        reservaId: r.id,
        maquilladoraId: m.id,
        servicioId: s.id,
        inicio: new Date(local("00:00").getTime() + i * 3_600_000),
        fin: new Date(local("00:00").getTime() + (i + 1) * 3_600_000),
      });
    }

    const primera = await lista({ pagina: 1 });
    const segunda = await lista({ pagina: 2 });

    expect(primera).toMatchObject({ total: 30, pagina: 1, hayMas: true });
    expect(primera.filas).toHaveLength(25);
    expect(segunda).toMatchObject({ total: 30, pagina: 2, hayMas: false });
    expect(segunda.filas).toHaveLength(5);
    const ids = [...primera.filas, ...segunda.filas].map((f) => f.id);
    expect(new Set(ids).size).toBe(30);
  });

  it("una página fuera de rango da una lista vacía sin error", async () => {
    await reservaConLinea({});

    const { filas, total, hayMas } = await lista({ pagina: 9 });

    expect(filas).toEqual([]);
    expect(total).toBe(1);
    expect(hayMas).toBe(false);
  });

  it("filtra por estado y el total cuenta solo ese estado", async () => {
    await reservaConLinea({});
    const confirmada = await reservaConLinea(validacion({ estado: "confirmada" }));
    await reservaConLinea(validacion());

    const r = await lista({ estado: "confirmada" });

    expect(r.filas.map((f) => f.id)).toEqual([confirmada.id]);
    expect(r.total).toBe(1);
  });

  it("sin reservas devuelve una lista vacía", async () => {
    expect(await lista()).toEqual({ filas: [], total: 0, pagina: 1, hayMas: false });
  });
});

describe("listarReservas: datos de cada fila", () => {
  it("una reserva grupal muestra su primer turno y tres personas", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db, validacion({ montoTotal: "360.00", nombreContacto: "Ana", telefonoContacto: "999000111" }));
    for (const [persona, desde, hasta] of [
      ["Tercera", "12:00", "13:00"],
      ["Primera", "10:00", "11:00"],
      ["Segunda", "11:00", "12:00"],
    ]) {
      await crearLinea(db, {
        reservaId: r.id,
        maquilladoraId: m.id,
        servicioId: s.id,
        persona,
        inicio: local(desde),
        fin: local(hasta),
      });
    }

    const { filas } = await lista();

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      id: r.id,
      estado: "pendiente_validacion",
      nombreContacto: "Ana",
      telefonoContacto: "999000111",
      numeroOperacion: r.numeroOperacion,
      montoTotal: "360.00",
      estadoReembolso: "no_aplica",
      personas: 3,
    });
    expect(filas[0].primerTurno).toEqual(local("10:00"));
  });
});

describe("listarReservas: marcas de una pendiente de pago", () => {
  it("una devuelta por un rechazo espera un nuevo número y su plazo no cuenta como vencido", async () => {
    await reservaConLinea({ creadaEn: hace(600), motivoRechazo: "número mal escrito" });

    const [fila] = (await lista()).filas;

    expect(fila).toMatchObject({ esperandoNuevoNumero: true, plazoVencido: false });
  });

  it("sin número ni rechazo y creada hace 30 minutos marca plazo vencido sin cambiar su estado", async () => {
    const r = await reservaConLinea({ creadaEn: hace(30) });

    const [fila] = (await lista()).filas;

    expect(fila).toMatchObject({ plazoVencido: true, esperandoNuevoNumero: false, estado: "pendiente_pago" });
    const [guardada] = await db.select().from(reserva);
    expect(guardada).toMatchObject({ id: r.id, estado: "pendiente_pago", motivoCancelacion: null });
  });

  it("una pendiente reciente no tiene ninguna marca", async () => {
    await reservaConLinea({ creadaEn: hace(5) });

    expect((await lista()).filas[0]).toMatchObject({ plazoVencido: false, esperandoNuevoNumero: false });
  });

  it("una reserva en validación o cancelada no tiene marcas", async () => {
    await reservaConLinea(validacion({ creadaEn: hace(900) }));
    await reservaConLinea({ estado: "cancelada", motivoCancelacion: "vencida", creadaEn: hace(900) });

    for (const fila of (await lista()).filas) {
      expect(fila).toMatchObject({ plazoVencido: false, esperandoNuevoNumero: false });
    }
  });
});

describe("obtenerReservaParaPanel", () => {
  it("trae la reserva con sus turnos ordenados por hora de inicio", async () => {
    const m = await crearMaquilladora(db, { nombre: "Ana" });
    const otra = await crearMaquilladora(db, { nombre: "Bea" });
    const s = await crearServicio(db, { nombre: "Peinado" });
    const r = await crearReserva(db, validacion({ montoTotal: "240.00", nombreContacto: "Carla", telefonoContacto: "987654321" }));
    await crearLinea(db, {
      reservaId: r.id,
      maquilladoraId: otra.id,
      servicioId: s.id,
      persona: "Segunda",
      inicio: local("12:00"),
      fin: local("13:00"),
    });
    await crearLinea(db, {
      reservaId: r.id,
      maquilladoraId: m.id,
      servicioId: s.id,
      persona: "Primera",
      inicio: local("10:00"),
      fin: local("11:00"),
    });

    const detalle = await obtenerReservaParaPanel(db, r.id);

    expect(detalle).toMatchObject({
      id: r.id,
      estado: "pendiente_validacion",
      nombreContacto: "Carla",
      telefonoContacto: "987654321",
      numeroOperacion: r.numeroOperacion,
      montoTotal: "240.00",
      motivoRechazo: null,
      motivoCancelacion: null,
      estadoReembolso: "no_aplica",
    });
    expect(detalle?.turnos.map((t) => [t.persona, t.maquilladora, t.servicio, t.activa])).toEqual([
      ["Primera", "Ana", "Peinado", true],
      ["Segunda", "Bea", "Peinado", true],
    ]);
  });

  it("incluye el motivo del rechazo y las líneas inactivas de una cancelada", async () => {
    const rechazada = await reservaConLinea({ motivoRechazo: "no aparece" });
    const cancelada = await reservaConLinea({ estado: "cancelada", motivoCancelacion: "studio" });
    await db.execute(sql`update reserva_linea set activa = false where reserva_id = ${cancelada.id}`);

    expect((await obtenerReservaParaPanel(db, rechazada.id))?.motivoRechazo).toBe("no aparece");
    const detalle = await obtenerReservaParaPanel(db, cancelada.id);
    expect(detalle).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio" });
    expect(detalle?.turnos.every((t) => !t.activa)).toBe(true);
  });

  it("un identificador inexistente da undefined", async () => {
    expect(await obtenerReservaParaPanel(db, 999)).toBeUndefined();
  });
});
