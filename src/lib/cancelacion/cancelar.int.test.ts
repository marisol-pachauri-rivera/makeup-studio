import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { cancelarReservaDeLaClienta } from "./cancelar";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-12-21T15:00:00Z");
const HORA = 3_600_000;
/** Un instante a `horas` de `AHORA`. */
const en = (horas: number) => new Date(AHORA.getTime() + horas * HORA);

type Extra = Partial<typeof reserva.$inferInsert>;

const ESTADOS: Record<"pendiente_pago" | "pendiente_validacion" | "confirmada", Extra> = {
  pendiente_pago: { estado: "pendiente_pago" },
  pendiente_validacion: { estado: "pendiente_validacion", numeroOperacion: "OP-1111" },
  confirmada: { estado: "confirmada", numeroOperacion: "OP-1111", validadaEn: AHORA },
};

/** Una reserva con una línea por cada `turnos` (horas desde AHORA) en una maquilladora propia. */
async function reservaCon(extra: Extra, turnos: number[] = [48]) {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  const r = await crearReserva(db, { creadaEn: AHORA, ...extra });
  for (const horas of turnos) {
    await crearLinea(db, {
      reservaId: r.id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: en(horas),
      fin: en(horas + 1),
    });
  }
  return { r, m, s };
}

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const lineasDe = (id: number) => db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, id));

describe("cancelarReservaDeLaClienta: estado y reembolso", () => {
  it("confirmada: queda cancelada por la clienta con reembolso pendiente y la línea inactiva", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "cancelada" });

    expect(await filaDe(r.id)).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "clienta",
      estadoReembolso: "pendiente",
    });
    expect((await lineasDe(r.id)).every((l) => !l.activa)).toBe(true);
  });

  it("pendiente_pago: reembolso no aplica", async () => {
    const { r } = await reservaCon(ESTADOS.pendiente_pago);
    await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    expect(await filaDe(r.id)).toMatchObject({ estado: "cancelada", estadoReembolso: "no_aplica" });
  });

  it("pendiente_validacion: reembolso pendiente (supuesto del design)", async () => {
    const { r } = await reservaCon(ESTADOS.pendiente_validacion);
    await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    expect(await filaDe(r.id)).toMatchObject({ estado: "cancelada", estadoReembolso: "pendiente" });
  });

  it("conserva el número de operación para poder devolver el pago", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada);
    await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    expect((await filaDe(r.id)).numeroOperacion).toBe("OP-1111");
  });

  it("un grupo de tres integrantes se cancela entero", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada, [48, 49, 50]);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "cancelada" });

    const lineas = await lineasDe(r.id);
    expect(lineas).toHaveLength(3);
    expect(lineas.every((l) => !l.activa)).toBe(true);
  });
});

describe("cancelarReservaDeLaClienta: plazo de 24 horas", () => {
  it("con exactamente 24 horas se acepta", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada, [24]);
    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "cancelada" });
  });

  it("con 23 h 59 min se rechaza y no cambia nada", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada, [24 - 1 / 60]);
    const antes = await filaDe(r.id);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "fuera_de_plazo" });

    expect(await filaDe(r.id)).toEqual(antes);
    expect((await lineasDe(r.id)).every((l) => l.activa)).toBe(true);
  });

  it("un grupo con el primer turno a menos de 24 h se rechaza aunque los otros estén lejos", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada, [10, 60, 70]);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "fuera_de_plazo" });

    expect((await filaDe(r.id)).estado).toBe("confirmada");
    expect((await lineasDe(r.id)).every((l) => l.activa)).toBe(true);
  });

  it("un turno ya pasado se rechaza", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada, [-3]);
    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "fuera_de_plazo" });
  });
});

describe("cancelarReservaDeLaClienta: casos sin cambio", () => {
  it("repetir la cancelación de la clienta responde cancelada sin cambiar nada", async () => {
    const { r } = await reservaCon(ESTADOS.confirmada);
    await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    const antes = await filaDe(r.id);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "cancelada" });
    expect(await filaDe(r.id)).toEqual(antes);
  });

  it.each(["vencida", "studio"] as const)("una reserva ya cancelada por %s responde ya cancelada y no cambia", async (motivo) => {
    const { r } = await reservaCon({ estado: "cancelada", motivoCancelacion: motivo });
    const antes = await filaDe(r.id);

    expect(await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA)).toEqual({ estado: "ya_cancelada" });
    expect(await filaDe(r.id)).toEqual(antes);
  });

  it("un token desconocido responde no encontrada", async () => {
    await reservaCon(ESTADOS.confirmada);
    expect(
      await cancelarReservaDeLaClienta(db, { token: "00000000-0000-4000-8000-000000000000" }, AHORA),
    ).toEqual({ estado: "no_encontrada" });
  });
});

describe("cancelarReservaDeLaClienta: liberación del horario", () => {
  it("la disponibilidad vuelve a ofrecer el horario cancelado", async () => {
    // 2026-12-28 es lunes; 09:00 en Lima = 14:00 UTC.
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db, { duracionMinutos: 60 });
    await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "10:00" });
    const r = await crearReserva(db, { ...ESTADOS.confirmada, creadaEn: AHORA });
    await crearLinea(db, {
      reservaId: r.id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: new Date("2026-12-28T14:00:00Z"),
      fin: new Date("2026-12-28T15:00:00Z"),
    });
    const ofrece = async () =>
      (await consultarDisponibilidad(db, { servicio: s, maquilladoraId: m.id, ahora: AHORA })).some(
        (d) => d.fecha === "2026-12-28",
      );

    expect(await ofrece()).toBe(false);
    await cancelarReservaDeLaClienta(db, { token: r.token }, AHORA);
    expect(await ofrece()).toBe(true);
  });
});
