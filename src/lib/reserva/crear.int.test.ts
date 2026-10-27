import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo, reserva, reservaLinea, servicio } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { crearReservaIndividual } from "./crear";
import type { SolicitudReserva } from "./esquemas";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string, fecha = "2026-12-21") => deLocalAInstante(`${fecha}T${hora}`) as Date;

let contador = 0;
const clave = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`;

/** Una maquilladora que trabaja los lunes de 09:00 a 13:00 y un servicio de 60 minutos a 350.50. */
async function escenario(extra: { duracionMinutos?: number; precio?: string } = {}) {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db, { precio: extra.precio ?? "350.50", duracionMinutos: extra.duracionMinutos ?? 60 });
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  return { m, s };
}

const solicitud = (
  e: { m: { id: number }; s: { id: number } },
  extra: Partial<SolicitudReserva> = {},
): SolicitudReserva => ({
  clave: clave(),
  servicioId: e.s.id,
  maquilladoraId: e.m.id,
  inicio: local("10:00"),
  nombre: "Lucía Pérez",
  telefono: "999111222",
  ...extra,
});

describe("creación de la reserva", () => {
  it("crea una reserva pendiente de pago con una línea activa y devuelve el token", async () => {
    const e = await escenario();
    const r = await crearReservaIndividual(db, solicitud(e), AHORA);

    expect(r).toMatchObject({ estado: "creada", repetida: false });
    if (r.estado !== "creada") throw new Error("reserva esperada");

    const [fila] = await db.select().from(reserva);
    expect(fila).toMatchObject({
      token: r.token,
      estado: "pendiente_pago",
      numeroOperacion: null,
      nombreContacto: "Lucía Pérez",
      telefonoContacto: "999111222",
      montoTotal: "350.50",
    });
    const lineas = await db.select().from(reservaLinea);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      reservaId: fila.id,
      persona: "Lucía Pérez",
      servicioId: e.s.id,
      maquilladoraId: e.m.id,
      precio: "350.50",
      activa: true,
    });
  });

  it("calcula el fin del turno con la duración del servicio", async () => {
    const e = await escenario({ duracionMinutos: 90 });
    await crearReservaIndividual(db, solicitud(e), AHORA);
    const [linea] = await db.select().from(reservaLinea);
    expect(linea.inicio.toISOString()).toBe("2026-12-21T15:00:00.000Z");
    expect(linea.fin.toISOString()).toBe("2026-12-21T16:30:00.000Z");
  });

  it("el horario reservado deja de ofrecerse y el contiguo sigue libre", async () => {
    const e = await escenario();
    await crearReservaIndividual(db, solicitud(e), AHORA);

    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("horario_no_disponible");
    expect((await crearReservaIndividual(db, solicitud(e, { inicio: local("11:00") }), AHORA)).estado).toBe("creada");
    expect((await crearReservaIndividual(db, solicitud(e, { inicio: local("09:00") }), AHORA)).estado).toBe("creada");
  });

  it("conserva el precio al reservar aunque el catálogo cambie después", async () => {
    const e = await escenario({ precio: "350.50" });
    await crearReservaIndividual(db, solicitud(e), AHORA);

    await db.update(servicio).set({ precio: "400.00" }).where(eq(servicio.id, e.s.id));

    const [fila] = await db.select().from(reserva);
    const [linea] = await db.select().from(reservaLinea);
    expect(fila.montoTotal).toBe("350.50");
    expect(linea.precio).toBe("350.50");
  });

  it("dos clientas distintas pueden reservar la misma hora con maquilladoras distintas", async () => {
    const e = await escenario();
    const otra = await crearMaquilladora(db, { nombre: "Bea" });
    await db.insert(horarioTrabajo).values({ maquilladoraId: otra.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });

    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("creada");
    expect((await crearReservaIndividual(db, solicitud({ m: otra, s: e.s }), AHORA)).estado).toBe("creada");
  });
});

describe("el servidor revalida la disponibilidad", () => {
  const sinCrear = async (r: Promise<{ estado: string }>, estado: string) => {
    expect((await r).estado).toBe(estado);
    expect(await db.select().from(reserva)).toHaveLength(0);
    expect(await db.select().from(reservaLinea)).toHaveLength(0);
  };

  it("rechaza un horario ocupado por una línea activa", async () => {
    const e = await escenario();
    // Una reserva reciente (no vencida) respecto del AHORA de la prueba.
    const vigente = await crearReserva(db, { creadaEn: AHORA });
    await crearLinea(db, {
      reservaId: vigente.id,
      maquilladoraId: e.m.id,
      servicioId: e.s.id,
      inicio: local("10:00"),
      fin: local("11:00"),
    });
    const antes = await db.select().from(reserva);
    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("horario_no_disponible");
    expect(await db.select().from(reserva)).toHaveLength(antes.length);
  });

  it("una línea inactiva no ocupa el horario", async () => {
    const e = await escenario();
    await crearLinea(db, {
      maquilladoraId: e.m.id,
      servicioId: e.s.id,
      inicio: local("10:00"),
      fin: local("11:00"),
      activa: false,
    });
    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("creada");
  });

  it("rechaza un horario fuera del horario de trabajo", () =>
    escenario().then((e) => sinCrear(crearReservaIndividual(db, solicitud(e, { inicio: local("08:00") }), AHORA), "horario_no_disponible")));

  it("rechaza un horario que no cabe antes del cierre", () =>
    escenario().then((e) => sinCrear(crearReservaIndividual(db, solicitud(e, { inicio: local("12:30") }), AHORA), "horario_no_disponible")));

  it("rechaza un horario fuera de la grilla de 30 minutos", () =>
    escenario().then((e) => sinCrear(crearReservaIndividual(db, solicitud(e, { inicio: local("10:15") }), AHORA), "horario_no_disponible")));

  it("rechaza un día sin horario de trabajo", () =>
    escenario().then((e) =>
      sinCrear(crearReservaIndividual(db, solicitud(e, { inicio: local("10:00", "2026-12-22") }), AHORA), "horario_no_disponible"),
    ));

  it("rechaza un horario que ya empezó", () =>
    escenario().then((e) =>
      sinCrear(crearReservaIndividual(db, solicitud(e), new Date("2026-12-21T15:10:00Z")), "horario_no_disponible"),
    ));

  it("rechaza un horario bloqueado", async () => {
    const e = await escenario();
    await db.insert(bloqueoAgenda).values({
      maquilladoraId: e.m.id,
      inicio: local("10:00"),
      fin: local("11:00"),
      motivo: "Capacitación",
    });
    await sinCrear(crearReservaIndividual(db, solicitud(e), AHORA), "horario_no_disponible");
  });

  it("rechaza un horario más allá de los 30 días", () =>
    escenario().then((e) =>
      sinCrear(crearReservaIndividual(db, solicitud(e, { inicio: local("10:00", "2027-03-01") }), AHORA), "horario_no_disponible"),
    ));

  it("rechaza si el servicio fue desactivado", async () => {
    const e = await escenario();
    await db.update(servicio).set({ activo: false }).where(eq(servicio.id, e.s.id));
    await sinCrear(crearReservaIndividual(db, solicitud(e), AHORA), "no_disponible");
  });

  it("rechaza si la maquilladora fue desactivada", async () => {
    const e = await escenario();
    await db.execute(sql`update maquilladora set activa = false where id = ${e.m.id}`);
    await sinCrear(crearReservaIndividual(db, solicitud(e), AHORA), "no_disponible");
  });

  it("rechaza un servicio o una maquilladora inexistentes", async () => {
    const e = await escenario();
    await sinCrear(crearReservaIndividual(db, solicitud(e, { servicioId: 9999 }), AHORA), "no_disponible");
    await sinCrear(crearReservaIndividual(db, solicitud(e, { maquilladoraId: 9999 }), AHORA), "no_disponible");
  });
});

describe("idempotencia del envío", () => {
  it("reenviar la misma clave devuelve la misma reserva sin crear otra", async () => {
    const e = await escenario();
    const s = solicitud(e);

    const primera = await crearReservaIndividual(db, s, AHORA);
    const segunda = await crearReservaIndividual(db, s, AHORA);

    expect(primera).toMatchObject({ estado: "creada", repetida: false });
    expect(segunda).toMatchObject({ estado: "creada", repetida: true });
    if (primera.estado !== "creada" || segunda.estado !== "creada") throw new Error("reserva esperada");
    expect(segunda.token).toBe(primera.token);
    expect(await db.select().from(reserva)).toHaveLength(1);
    expect(await db.select().from(reservaLinea)).toHaveLength(1);
  });

  it("el reenvío funciona aunque el horario ya no se ofrezca (porque es suyo)", async () => {
    const e = await escenario();
    const s = solicitud(e);
    await crearReservaIndividual(db, s, AHORA);
    expect((await crearReservaIndividual(db, s, AHORA)).estado).toBe("creada");
  });

  it("el reenvío funciona incluso si el horario ya pasó", async () => {
    const e = await escenario();
    const s = solicitud(e);
    const primera = await crearReservaIndividual(db, s, AHORA);
    const tarde = await crearReservaIndividual(db, s, new Date("2026-12-21T20:00:00Z"));
    expect(tarde).toMatchObject({ estado: "creada", repetida: true });
    if (primera.estado !== "creada" || tarde.estado !== "creada") throw new Error("reserva esperada");
    expect(tarde.token).toBe(primera.token);
  });

  it("claves distintas por el mismo horario son clientas distintas: solo una gana", async () => {
    const e = await escenario();
    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("creada");
    expect((await crearReservaIndividual(db, solicitud(e), AHORA)).estado).toBe("horario_no_disponible");
    expect(await db.select().from(reserva)).toHaveLength(1);
  });

  it("dos envíos simultáneos con la misma clave crean una sola reserva y ninguno informa un choque", async () => {
    const e = await escenario();
    for (let ronda = 0; ronda < 5; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);
      const s = solicitud(e);

      const [a, b] = await Promise.all([crearReservaIndividual(db, s, AHORA), crearReservaIndividual(db, s, AHORA)]);

      expect(a.estado).toBe("creada");
      expect(b.estado).toBe("creada");
      if (a.estado !== "creada" || b.estado !== "creada") throw new Error("reserva esperada");
      expect(a.token).toBe(b.token);
      expect(await db.select().from(reserva)).toHaveLength(1);
      expect(await db.select().from(reservaLinea)).toHaveLength(1);
    }
  });
});

describe("dos clientas por el mismo horario a la vez", () => {
  it("una gana y la otra recibe horario no disponible, sin filas a medias", async () => {
    const e = await escenario();
    for (let ronda = 0; ronda < 10; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);

      const resultados = await Promise.all([
        crearReservaIndividual(db, solicitud(e, { nombre: "Clienta A" }), AHORA),
        crearReservaIndividual(db, solicitud(e, { nombre: "Clienta B" }), AHORA),
      ]);

      expect(resultados.map((r) => r.estado).sort()).toEqual(["creada", "horario_no_disponible"]);
      expect(await db.select().from(reserva)).toHaveLength(1);
      expect(await db.select().from(reservaLinea)).toHaveLength(1);
    }
  });

  it("con varias clientas a la vez exactamente una se queda con el horario", async () => {
    const e = await escenario();
    const resultados = await Promise.all(
      Array.from({ length: 6 }, (_, i) => crearReservaIndividual(db, solicitud(e, { nombre: `Clienta ${i}` }), AHORA)),
    );
    expect(resultados.filter((r) => r.estado === "creada")).toHaveLength(1);
    expect(resultados.filter((r) => r.estado === "horario_no_disponible")).toHaveLength(5);
    expect(await db.select().from(reservaLinea)).toHaveLength(1);
  });
});
