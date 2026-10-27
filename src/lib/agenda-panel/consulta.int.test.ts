import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { obtenerAgendaDelDia } from "./consulta";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const DIA = "2026-12-21";
const SIGUIENTE = "2026-12-22";
const AHORA = new Date("2026-12-21T15:00:00Z");
const local = (hora: string, fecha = DIA) => deLocalAInstante(`${fecha}T${hora}`) as Date;

type Extra = Partial<Parameters<typeof crearReserva>[1]>;

/** Un turno de una reserva (vigente por defecto) con la maquilladora y el servicio dados. */
async function turno(
  m: { id: number },
  s: { id: number },
  desde: Date,
  hasta: Date,
  extra: Extra & { persona?: string; activa?: boolean } = {},
) {
  const { persona, activa, ...reserva } = extra;
  const r = await crearReserva(db, { estado: "confirmada", numeroOperacion: `OP-${Math.random().toString(36).slice(2, 9)}`, creadaEn: AHORA, ...reserva });
  return crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: desde,
    fin: hasta,
    ...(persona ? { persona } : {}),
    ...(activa === undefined ? {} : { activa }),
  });
}

describe("obtenerAgendaDelDia: qué turnos entran", () => {
  it("solo trae líneas activas y excluye las de una reserva cancelada", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("10:00"), local("11:00"), { persona: "Viva" });
    await turno(m, s, local("11:00"), local("12:00"), {
      persona: "Cancelada",
      estado: "cancelada",
      motivoCancelacion: "clienta",
      numeroOperacion: null,
      activa: false,
    });

    const agenda = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(agenda.turnos.map((t) => t.persona)).toEqual(["Viva"]);
  });

  it("una reserva grupal aparece con un turno por persona", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db, { estado: "confirmada", numeroOperacion: "OP-1111", creadaEn: AHORA });
    for (const [persona, desde, hasta] of [
      ["Ana", "10:00", "11:00"],
      ["Bea", "11:00", "12:00"],
      ["Carla", "12:00", "13:00"],
    ]) {
      await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, persona, inicio: local(desde), fin: local(hasta) });
    }

    const agenda = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(agenda.turnos.map((t) => t.persona)).toEqual(["Ana", "Bea", "Carla"]);
  });

  it("trae servicio, estado y contacto de la reserva, ordenados por hora", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db, { nombre: "Peinado" });
    await turno(m, s, local("14:00"), local("15:00"), { persona: "Tarde", nombreContacto: "Madre", telefonoContacto: "999000111" });
    await turno(m, s, local("09:00"), local("10:00"), { persona: "Temprano" });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos.map((t) => t.persona)).toEqual(["Temprano", "Tarde"]);
    expect(turnos[1]).toMatchObject({
      servicio: "Peinado",
      estadoReserva: "confirmada",
      nombreContacto: "Madre",
      telefonoContacto: "999000111",
      vencida: false,
    });
  });

  it("dos maquilladoras quedan separadas por su id", async () => {
    const a = await crearMaquilladora(db, { nombre: "Ana" });
    const b = await crearMaquilladora(db, { nombre: "Bea" });
    const s = await crearServicio(db);
    await turno(a, s, local("10:00"), local("11:00"), { persona: "DeAna" });
    await turno(b, s, local("10:00"), local("11:00"), { persona: "DeBea" });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos.find((t) => t.persona === "DeAna")?.maquilladoraId).toBe(a.id);
    expect(turnos.find((t) => t.persona === "DeBea")?.maquilladoraId).toBe(b.id);
  });

  it("incluye a las maquilladoras activas e inactivas: la vista decide cuáles mostrar", async () => {
    await crearMaquilladora(db, { nombre: "Activa" });
    await crearMaquilladora(db, { nombre: "Inactiva", activa: false });
    const { maquilladoras } = await obtenerAgendaDelDia(db, DIA, AHORA);
    expect(maquilladoras.map((m) => [m.nombre, m.activa])).toEqual([
      ["Activa", true],
      ["Inactiva", false],
    ]);
  });
});

describe("obtenerAgendaDelDia: el día de Lima", () => {
  it("23:30 de Lima (04:30 UTC del día siguiente) cuenta en su día y 00:00 del siguiente no", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("22:30"), local("23:30"), { persona: "Noche" });
    await turno(m, s, local("00:00", SIGUIENTE), local("01:00", SIGUIENTE), { persona: "Madrugada" });

    const delDia = await obtenerAgendaDelDia(db, DIA, AHORA);
    const delSiguiente = await obtenerAgendaDelDia(db, SIGUIENTE, AHORA);

    expect(delDia.turnos.map((t) => t.persona)).toEqual(["Noche"]);
    expect(delSiguiente.turnos.map((t) => t.persona)).toEqual(["Madrugada"]);
  });

  it("un turno que cruza la medianoche aparece en los dos días", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("23:30"), local("00:30", SIGUIENTE), { persona: "Cruza" });

    expect((await obtenerAgendaDelDia(db, DIA, AHORA)).turnos).toHaveLength(1);
    expect((await obtenerAgendaDelDia(db, SIGUIENTE, AHORA)).turnos).toHaveLength(1);
    expect((await obtenerAgendaDelDia(db, "2026-12-20", AHORA)).turnos).toHaveLength(0);
  });

  it("un bloqueo que cruza la medianoche aparece en los dos días, con su motivo", async () => {
    const m = await crearMaquilladora(db);
    await db.insert(bloqueoAgenda).values({ maquilladoraId: m.id, inicio: local("22:00"), fin: local("08:00", SIGUIENTE), motivo: "Curso" });

    const lunes = await obtenerAgendaDelDia(db, DIA, AHORA);
    const martes = await obtenerAgendaDelDia(db, SIGUIENTE, AHORA);
    const miercoles = await obtenerAgendaDelDia(db, "2026-12-23", AHORA);

    expect(lunes.bloqueos).toHaveLength(1);
    expect(martes.bloqueos[0]).toMatchObject({ maquilladoraId: m.id, motivo: "Curso" });
    expect(miercoles.bloqueos).toHaveLength(0);
  });

  it("un bloqueo que termina justo a las 00:00 no cuenta en el día siguiente", async () => {
    const m = await crearMaquilladora(db);
    await db.insert(bloqueoAgenda).values({ maquilladoraId: m.id, inicio: local("20:00"), fin: local("00:00", SIGUIENTE), motivo: "Cierre" });
    expect((await obtenerAgendaDelDia(db, SIGUIENTE, AHORA)).bloqueos).toEqual([]);
  });

  it("los tramos de trabajo son los del día de la semana de la fecha, en orden", async () => {
    const m = await crearMaquilladora(db);
    await db.insert(horarioTrabajo).values([
      { maquilladoraId: m.id, diaSemana: 1, horaInicio: "15:00", horaFin: "19:00" },
      { maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" },
      { maquilladoraId: m.id, diaSemana: 2, horaInicio: "10:00", horaFin: "12:00" },
    ]);

    const lunes = await obtenerAgendaDelDia(db, DIA, AHORA);
    const domingo = await obtenerAgendaDelDia(db, "2026-12-20", AHORA);

    expect(lunes.tramos.get(m.id)).toEqual([
      { horaInicio: "09:00:00", horaFin: "13:00:00" },
      { horaInicio: "15:00:00", horaFin: "19:00:00" },
    ]);
    expect(domingo.tramos.get(m.id)).toBeUndefined();
  });
});

describe("obtenerAgendaDelDia: coherencia con la disponibilidad pública", () => {
  const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);

  it("una reserva sin pago de hace 30 minutos figura como vencida y su turno sigue apareciendo", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("10:00"), local("11:00"), { estado: "pendiente_pago", numeroOperacion: null, creadaEn: hace(30) });

    const { turnos } = await obtenerAgendaDelDia(db, DIA, AHORA);

    expect(turnos).toHaveLength(1);
    expect(turnos[0]).toMatchObject({ estadoReserva: "pendiente_pago", vencida: true });
  });

  it("una pendiente de pago reciente no está vencida", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("10:00"), local("11:00"), { estado: "pendiente_pago", numeroOperacion: null, creadaEn: hace(5) });
    expect((await obtenerAgendaDelDia(db, DIA, AHORA)).turnos[0].vencida).toBe(false);
  });

  it("una reserva devuelta por un rechazo no es vencida, aunque lleve días", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await turno(m, s, local("10:00"), local("11:00"), {
      estado: "pendiente_pago",
      numeroOperacion: null,
      creadaEn: hace(60 * 24 * 3),
      motivoRechazo: "no aparece",
    });

    const [t] = (await obtenerAgendaDelDia(db, DIA, AHORA)).turnos;

    expect(t).toMatchObject({ vencida: false, motivoRechazo: "no aparece" });
  });

  it("la agenda solo lee: tras mostrar una vencida su estado no cambia", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const l = await turno(m, s, local("10:00"), local("11:00"), { estado: "pendiente_pago", numeroOperacion: null, creadaEn: hace(30) });

    await obtenerAgendaDelDia(db, DIA, AHORA);

    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.id, l.id)))[0].activa).toBe(true);
    const { rows } = await db.execute<{ estado: string }>(sql`select estado from reserva limit 1`);
    expect(rows[0].estado).toBe("pendiente_pago");
  });
});
