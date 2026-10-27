import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, reserva, reservaLinea, servicio } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearReserva } from "../../../tests/support/fixtures";
import {
  antes,
  local,
  MADRUGADA,
  mundoGrupal,
  persona,
  solicitudGrupal,
  trioBase,
  type MundoGrupal,
} from "../../../tests/support/grupo";
import { crearReservaGrupal } from "./crear-grupal";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

let w: MundoGrupal;
beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
  w = await mundoGrupal(db);
});

/** Ocupa `[desde, hasta)` de una maquilladora con una reserva reciente (no vencida) de otra clienta. */
async function ocupar(m: { id: number }, desde: string, hasta: string) {
  const r = await crearReserva(db, { creadaEn: MADRUGADA });
  await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: w.s60.id, inicio: local(desde), fin: local(hasta) });
  return r;
}

const totales = async () => ({
  reservas: (await db.select().from(reserva)).length,
  lineas: (await db.select().from(reservaLinea)).length,
});

describe("creación del grupo", () => {
  it("crea una reserva con una línea por integrante, un solo token y el monto total exacto", async () => {
    const resultado = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(resultado).toMatchObject({ estado: "creada", repetida: false });
    if (resultado.estado !== "creada") throw new Error("grupo esperado");

    const [fila] = await db.select().from(reserva);
    expect(fila).toMatchObject({
      token: resultado.token,
      estado: "pendiente_pago",
      numeroOperacion: null,
      nombreContacto: "Lucía Pérez",
      telefonoContacto: "999111222",
      montoTotal: "550.60",
    });

    const lineas = await db.select().from(reservaLinea).orderBy(reservaLinea.id);
    expect(lineas).toHaveLength(3);
    expect(lineas.map((l) => [l.persona, l.precio, l.activa])).toEqual([
      ["Ana", "350.50", true],
      ["Bea", "120.10", true],
      ["Carla", "80.00", true],
    ]);
    // El fin de cada turno sale del servicio de esa integrante.
    expect(lineas.map((l) => (l.fin.getTime() - l.inicio.getTime()) / 60_000)).toEqual([60, 90, 30]);
    expect(lineas.every((l) => l.reservaId === fila.id)).toBe(true);
  });

  it("el contacto es el de quien reserva y cada línea guarda a su integrante", async () => {
    await crearReservaGrupal(db, solicitudGrupal(trioBase(w), { nombre: "Quien Reserva", telefono: "+51 988 777 666" }), MADRUGADA);
    const [fila] = await db.select().from(reserva);
    expect(fila).toMatchObject({ nombreContacto: "Quien Reserva", telefonoContacto: "+51 988 777 666" });
    expect((await db.select().from(reservaLinea)).map((l) => l.persona).sort()).toEqual(["Ana", "Bea", "Carla"]);
  });

  it("dos integrantes con maquilladoras distintas a la misma hora se crean", async () => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s60, w.m2, "10:00")]),
      MADRUGADA,
    );
    expect(r.estado).toBe("creada");
    expect((await totales()).lineas).toBe(2);
  });

  it("acepta turnos contiguos de la misma maquilladora", async () => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s60, w.m1, "11:00")]),
      MADRUGADA,
    );
    expect(r.estado).toBe("creada");
  });

  it("conserva los precios aunque el catálogo cambie después", async () => {
    await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);
    await db.update(servicio).set({ precio: "999.00" });

    expect((await db.select().from(reserva))[0].montoTotal).toBe("550.60");
    expect((await db.select().from(reservaLinea)).map((l) => l.precio).sort()).toEqual(["120.10", "350.50", "80.00"]);
  });

  it("suma servicios iguales repetidos (tres integrantes del mismo servicio)", async () => {
    await crearReservaGrupal(
      db,
      solicitudGrupal([
        persona("Ana", w.s60, w.m1, "09:00"),
        persona("Bea", w.s60, w.m1, "10:00"),
        persona("Carla", w.s60, w.m2, "09:00"),
      ]),
      MADRUGADA,
    );
    expect((await db.select().from(reserva))[0].montoTotal).toBe("1051.50");
  });

  it("los horarios del grupo dejan de ofrecerse y otra clienta recibe horario no disponible", async () => {
    await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);
    const otro = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Otra", w.s60, w.m1, "10:00"), persona("Más", w.s60, w.m2, "12:00")]),
      MADRUGADA,
    );
    expect(otro).toMatchObject({ estado: "rechazada", horariosNoDisponibles: [0], noDisponibles: [], solapamientos: [] });
  });
});

describe("rechazos que no guardan nada y señalan a las integrantes", () => {
  const sinCambios = async (antesDelGrupo: { reservas: number; lineas: number }) =>
    expect(await totales()).toEqual(antesDelGrupo);

  it("una línea ocupada entre libres: no queda ninguna y se señala la correcta", async () => {
    await ocupar(w.m2, "10:00", "11:00");
    const previo = await totales();

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r).toEqual({ estado: "rechazada", noDisponibles: [], horariosNoDisponibles: [1], solapamientos: [] });
    await sinCambios(previo);
  });

  it("señala a varias integrantes afectadas", async () => {
    await ocupar(w.m1, "10:00", "11:00");
    await ocupar(w.m2, "10:00", "11:00");
    const previo = await totales();

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r).toMatchObject({ estado: "rechazada", horariosNoDisponibles: [0, 1] });
    await sinCambios(previo);
  });

  it("detecta el solapamiento dentro del grupo sin depender de Postgres", async () => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s60, w.m1, "10:30"), persona("Carla", w.s60, w.m2, "10:00")]),
      MADRUGADA,
    );
    expect(r).toEqual({ estado: "rechazada", noDisponibles: [], horariosNoDisponibles: [], solapamientos: [[0, 1]] });
    expect(await totales()).toEqual({ reservas: 0, lineas: 0 });
  });

  it("detecta el mismo horario con la misma maquilladora", async () => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s60, w.m1, "10:00")]),
      MADRUGADA,
    );
    expect(r).toMatchObject({ estado: "rechazada", solapamientos: [[0, 1]] });
  });

  it("informa a la vez un solapamiento interno y un horario ocupado, cada uno con sus integrantes", async () => {
    await ocupar(w.m2, "12:00", "13:00");
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([
        persona("Ana", w.s60, w.m1, "10:00"),
        persona("Bea", w.s60, w.m1, "10:30"),
        persona("Carla", w.s60, w.m2, "12:00"),
      ]),
      MADRUGADA,
    );
    expect(r).toEqual({ estado: "rechazada", noDisponibles: [], horariosNoDisponibles: [2], solapamientos: [[0, 1]] });
  });

  it("un servicio desactivado señala a su integrante", async () => {
    await db.update(servicio).set({ activo: false }).where(eq(servicio.id, w.s90.id));
    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);
    expect(r).toMatchObject({ estado: "rechazada", noDisponibles: [1] });
    expect(await totales()).toEqual({ reservas: 0, lineas: 0 });
  });

  it("una maquilladora desactivada señala a todas sus integrantes", async () => {
    await db.execute(sql`update maquilladora set activa = false where id = ${w.m1.id}`);
    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);
    expect(r).toMatchObject({ estado: "rechazada", noDisponibles: [0, 2] });
  });

  it("un servicio o una maquilladora inexistentes señalan a su integrante", async () => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", { id: 9999 }, w.m1, "10:00"), persona("Bea", w.s60, { id: 9999 }, "10:00")]),
      MADRUGADA,
    );
    expect(r).toMatchObject({ estado: "rechazada", noDisponibles: [0, 1] });
  });

  it.each([
    ["fuera de la grilla de 30 minutos", "10:15"],
    ["fuera del horario de trabajo", "08:00"],
    ["que no alcanza antes del cierre", "12:30"],
  ])("un horario %s se rechaza", async (_caso, hora) => {
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s60, w.m2, hora)]),
      MADRUGADA,
    );
    expect(r).toMatchObject({ estado: "rechazada", horariosNoDisponibles: [1] });
  });

  it("un horario que ya empezó se rechaza", async () => {
    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), new Date("2026-12-21T15:10:00Z"));
    expect(r).toMatchObject({ estado: "rechazada", horariosNoDisponibles: [0, 1] });
  });

  it("un horario bloqueado se rechaza", async () => {
    await db.insert(bloqueoAgenda).values({ maquilladoraId: w.m2.id, inicio: local("10:00"), fin: local("11:00"), motivo: "Ausencia" });
    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);
    expect(r).toMatchObject({ estado: "rechazada", horariosNoDisponibles: [1] });
  });

  it("deja pasar el servicio inactivo de una integrante que no usa a otras", async () => {
    await db.update(servicio).set({ activo: false }).where(eq(servicio.id, w.s30.id));
    const r = await crearReservaGrupal(
      db,
      solicitudGrupal([persona("Ana", w.s60, w.m1, "10:00"), persona("Bea", w.s90, w.m2, "10:00")]),
      MADRUGADA,
    );
    expect(r.estado).toBe("creada");
  });
});

describe("el grupo y las reservas vencidas", () => {
  it("libera la reserva vencida que ocupa el horario de una integrante y crea todo el grupo", async () => {
    const vencida = await crearReserva(db, { creadaEn: antes(30) });
    await crearLinea(db, {
      reservaId: vencida.id,
      maquilladoraId: w.m2.id,
      servicioId: w.s60.id,
      inicio: local("10:00"),
      fin: local("11:00"),
    });

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r.estado).toBe("creada");
    const [cancelada] = await db.select().from(reserva).where(eq(reserva.id, vencida.id));
    expect(cancelada).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, vencida.id))).map((l) => l.activa)).toEqual([false]);
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.activa, true)))).toHaveLength(3);
  });
});
