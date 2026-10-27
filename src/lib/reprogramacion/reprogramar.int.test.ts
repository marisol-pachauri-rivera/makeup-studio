import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { reprogramarTurno, type SolicitudReprogramacion } from "./reprogramar";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes. Los turnos son el lunes 28, una semana después: sobra el plazo de 24 horas.
const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string, dia = "2026-12-28") => deLocalAInstante(`${dia}T${hora}`) as Date;

type Extra = Partial<typeof reserva.$inferInsert>;

/** Dos maquilladoras que trabajan los lunes de 09:00 a 18:00 y una reserva confirmada con un turno 10:00-11:00. */
async function mundo(extra: Extra = {}) {
  const m = await crearMaquilladora(db, { nombre: "Ana" });
  const otra = await crearMaquilladora(db, { nombre: "Bea" });
  const s = await crearServicio(db, { precio: "120.00", duracionMinutos: 60 });
  for (const id of [m.id, otra.id]) {
    await db.insert(horarioTrabajo).values({ maquilladoraId: id, diaSemana: 1, horaInicio: "09:00", horaFin: "18:00" });
  }
  const r = await crearReserva(db, {
    estado: "confirmada",
    numeroOperacion: "OP-1111",
    montoTotal: "120.00",
    creadaEn: AHORA,
    ...extra,
  });
  const linea = await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: local("10:00"),
    fin: local("11:00"),
    activa: r.estado !== "cancelada",
  });
  return { m, otra, s, r, linea };
}

type Mundo = Awaited<ReturnType<typeof mundo>>;

const pedir = (w: Mundo, extra: Partial<SolicitudReprogramacion> = {}): SolicitudReprogramacion => ({
  token: w.r.token,
  lineaId: w.linea.id,
  maquilladoraId: w.otra.id,
  inicio: local("12:00"),
  inicioVisto: local("10:00"),
  maquilladoraVistaId: w.m.id,
  ...extra,
});

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const lineaDe = async (id: number) => (await db.select().from(reservaLinea).where(eq(reservaLinea.id, id)))[0];

describe("reprogramarTurno: éxito", () => {
  it("cambia inicio, fin y maquilladora; estado, número, monto y precio no", async () => {
    const w = await mundo();

    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "reprogramada", repetida: false });

    expect(await lineaDe(w.linea.id)).toMatchObject({
      maquilladoraId: w.otra.id,
      inicio: local("12:00"),
      fin: local("13:00"),
      precio: "120.00",
      activa: true,
    });
    expect(await filaDe(w.r.id)).toMatchObject({
      estado: "confirmada",
      numeroOperacion: "OP-1111",
      montoTotal: "120.00",
      estadoReembolso: "no_aplica",
    });
  });

  it("el fin es el nuevo inicio más la duración original, aunque el servicio haya cambiado", async () => {
    const w = await mundo();
    await db.execute(sql`update servicio set duracion_minutos = 120 where id = ${w.s.id}`);

    await reprogramarTurno(db, pedir(w), AHORA);

    expect((await lineaDe(w.linea.id)).fin).toEqual(local("13:00"));
  });

  it("puede desplazarse sobre su propio horario (10:30 con la misma maquilladora)", async () => {
    const w = await mundo();
    const r = await reprogramarTurno(db, pedir(w, { maquilladoraId: w.m.id, inicio: local("10:30") }), AHORA);
    expect(r).toEqual({ estado: "reprogramada", repetida: false });
    expect((await lineaDe(w.linea.id)).inicio).toEqual(local("10:30"));
  });

  it("en un grupo mueve solo ese turno: las otras integrantes y el monto total no cambian", async () => {
    const w = await mundo({ montoTotal: "240.00" });
    const otra = await crearLinea(db, {
      reservaId: w.r.id,
      maquilladoraId: w.m.id,
      servicioId: w.s.id,
      persona: "Segunda",
      inicio: local("11:00"),
      fin: local("12:00"),
    });

    await reprogramarTurno(db, pedir(w), AHORA);

    expect(await lineaDe(otra.id)).toMatchObject({ maquilladoraId: w.m.id, inicio: local("11:00"), fin: local("12:00") });
    expect((await filaDe(w.r.id)).montoTotal).toBe("240.00");
  });

  it("se puede reprogramar el mismo turno varias veces, sin tope", async () => {
    const w = await mundo();
    expect((await reprogramarTurno(db, pedir(w), AHORA)).estado).toBe("reprogramada");
    const segunda = await reprogramarTurno(
      db,
      pedir(w, {
        maquilladoraId: w.m.id,
        inicio: local("15:00"),
        inicioVisto: local("12:00"),
        maquilladoraVistaId: w.otra.id,
      }),
      AHORA,
    );
    expect(segunda).toEqual({ estado: "reprogramada", repetida: false });
    expect(await lineaDe(w.linea.id)).toMatchObject({ maquilladoraId: w.m.id, inicio: local("15:00") });
  });
});

describe("reprogramarTurno: rechazos que dejan el turno original intacto", () => {
  async function intacto(w: Mundo) {
    expect(await lineaDe(w.linea.id)).toMatchObject({
      maquilladoraId: w.m.id,
      inicio: local("10:00"),
      fin: local("11:00"),
      activa: true,
    });
  }

  it("horario ocupado por otra reserva vigente", async () => {
    const w = await mundo();
    const otra = await crearReserva(db, { estado: "confirmada", numeroOperacion: "OP-2222", creadaEn: AHORA });
    await crearLinea(db, {
      reservaId: otra.id,
      maquilladoraId: w.otra.id,
      servicioId: w.s.id,
      inicio: local("12:00"),
      fin: local("13:00"),
    });

    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "horario_no_disponible" });
    await intacto(w);
  });

  it("bloqueo de agenda en el destino", async () => {
    const w = await mundo();
    await db.insert(bloqueoAgenda).values({ maquilladoraId: w.otra.id, inicio: local("12:00"), fin: local("13:00"), motivo: "Curso" });

    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "horario_no_disponible" });
    await intacto(w);
  });

  it.each(["08:00", "17:30", "12:15"])("destino %s fuera del horario de trabajo o de la grilla", async (hora) => {
    const w = await mundo();
    expect(await reprogramarTurno(db, pedir(w, { inicio: local(hora) }), AHORA)).toEqual({
      estado: "horario_no_disponible",
    });
    await intacto(w);
  });

  it.each([
    ["pendiente_pago", { estado: "pendiente_pago" as const, numeroOperacion: null }],
    ["pendiente_validacion", { estado: "pendiente_validacion" as const }],
    ["cancelada", { estado: "cancelada" as const, motivoCancelacion: "studio" as const }],
  ])("una reserva %s no se reprograma", async (_nombre, extra) => {
    const w = await mundo(extra);
    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "no_reprogramable" });
    expect((await lineaDe(w.linea.id)).inicio).toEqual(local("10:00"));
  });

  it("con 23 h 59 min de anticipación se rechaza", async () => {
    const w = await mundo();
    const casi = new Date(local("10:00").getTime() - (24 * 60 - 1) * 60_000);

    expect(await reprogramarTurno(db, pedir(w), casi)).toEqual({ estado: "fuera_de_plazo" });
    await intacto(w);
  });

  it("con exactamente 24 horas se acepta", async () => {
    const w = await mundo();
    const justo = new Date(local("10:00").getTime() - 24 * 3_600_000);
    expect(await reprogramarTurno(db, pedir(w), justo)).toEqual({ estado: "reprogramada", repetida: false });
  });

  it("un turno de otra reserva responde no encontrada", async () => {
    const w = await mundo();
    const ajena = await mundo({ numeroOperacion: "OP-9999" });

    expect(await reprogramarTurno(db, pedir(w, { lineaId: ajena.linea.id }), AHORA)).toEqual({ estado: "no_encontrada" });
    expect((await lineaDe(ajena.linea.id)).inicio).toEqual(local("10:00"));
  });

  it("un token desconocido responde no encontrada", async () => {
    const w = await mundo();
    expect(
      await reprogramarTurno(db, pedir(w, { token: "00000000-0000-4000-8000-000000000000" }), AHORA),
    ).toEqual({ estado: "no_encontrada" });
  });

  it("una maquilladora inactiva o inexistente no se ofrece", async () => {
    const w = await mundo();
    await db.execute(sql`update maquilladora set activa = false where id = ${w.otra.id}`);

    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "maquilladora_no_disponible" });
    expect(await reprogramarTurno(db, pedir(w, { maquilladoraId: 9999 }), AHORA)).toEqual({
      estado: "maquilladora_no_disponible",
    });
    await intacto(w);
  });

  it("el estado de la reserva y el número no cambian al rechazar", async () => {
    const w = await mundo();
    await db.insert(bloqueoAgenda).values({ maquilladoraId: w.otra.id, inicio: local("12:00"), fin: local("13:00"), motivo: "Curso" });
    await reprogramarTurno(db, pedir(w), AHORA);
    expect(await filaDe(w.r.id)).toMatchObject({ estado: "confirmada", numeroOperacion: "OP-1111" });
  });
});

describe("reprogramarTurno: idempotencia", () => {
  it("repetir la misma confirmación responde éxito repetido sin otro cambio", async () => {
    const w = await mundo();
    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "reprogramada", repetida: false });

    expect(await reprogramarTurno(db, pedir(w), AHORA)).toEqual({ estado: "reprogramada", repetida: true });
    expect(await lineaDe(w.linea.id)).toMatchObject({ maquilladoraId: w.otra.id, inicio: local("12:00") });
  });

  it("dos envíos simultáneos: uno mueve y el otro responde repetida", async () => {
    const w = await mundo();

    const resultados = await Promise.all([reprogramarTurno(db, pedir(w), AHORA), reprogramarTurno(db, pedir(w), AHORA)]);

    expect(resultados.map((r) => r.estado)).toEqual(["reprogramada", "reprogramada"]);
    expect(resultados.filter((r) => r.estado === "reprogramada" && !r.repetida)).toHaveLength(1);
    expect(await lineaDe(w.linea.id)).toMatchObject({ maquilladoraId: w.otra.id, inicio: local("12:00") });
  });

  it("una pantalla desactualizada (otra pestaña ya lo movió) responde turno_cambiado", async () => {
    const w = await mundo();
    await reprogramarTurno(db, pedir(w), AHORA);

    // La pantalla vieja todavía cree que el turno está a las 10:00 con Ana y pide otro horario.
    const r = await reprogramarTurno(db, pedir(w, { inicio: local("15:00") }), AHORA);

    expect(r).toEqual({ estado: "turno_cambiado" });
    expect((await lineaDe(w.linea.id)).inicio).toEqual(local("12:00"));
  });
});
