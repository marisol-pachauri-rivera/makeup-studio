import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { ingresarNumeroDeOperacion } from "@/lib/pago/ingreso";
import { crearReservaIndividual } from "@/lib/reserva/crear";
import { condicionVencida } from "@/lib/reserva/vencimiento";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { cancelarReserva, rechazarReserva, validarReserva } from "./transiciones";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

/** Una maquilladora que trabaja los lunes de 09:00 a 13:00 y un servicio de 60 minutos. */
async function escenario() {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  return { m, s };
}

type Extra = Partial<typeof reserva.$inferInsert>;

/** Una reserva con una línea activa de 10:00 a 11:00 en el estado pedido. */
async function reservaEn(estado: (typeof reserva.$inferSelect)["estado"], extra: Extra = {}) {
  const e = await escenario();
  const base: Extra =
    estado === "pendiente_pago"
      ? { estado }
      : estado === "pendiente_validacion"
        ? { estado, numeroOperacion: "OP-1111" }
        : estado === "confirmada"
          ? { estado, numeroOperacion: "OP-1111", validadaEn: AHORA }
          : { estado, motivoCancelacion: "clienta" };
  const r = await crearReserva(db, { creadaEn: AHORA, ...base, ...extra });
  const linea = await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: e.m.id,
    servicioId: e.s.id,
    inicio: local("10:00"),
    fin: local("11:00"),
    activa: estado !== "cancelada",
  });
  return { ...e, r, linea };
}

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const lineasDe = (id: number) => db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, id));

describe("validarReserva", () => {
  it("deja la reserva confirmada con validada_en y conserva el número y las líneas", async () => {
    const { r } = await reservaEn("pendiente_validacion");

    expect(await validarReserva(db, r.id)).toEqual({ estado: "aplicada" });

    const fila = await filaDe(r.id);
    expect(fila).toMatchObject({ estado: "confirmada", numeroOperacion: "OP-1111", motivoRechazo: null });
    expect(fila.validadaEn).toBeInstanceOf(Date);
    expect((await lineasDe(r.id)).every((l) => l.activa)).toBe(true);
  });

  it("una reserva ya confirmada no cambia, ni su validada_en, y se informa que ya lo estaba", async () => {
    const { r } = await reservaEn("confirmada");
    const antes = await filaDe(r.id);

    expect(await validarReserva(db, r.id)).toEqual({ estado: "ya_aplicada", actual: "confirmada" });
    expect(await filaDe(r.id)).toEqual(antes);
  });

  it.each(["cancelada", "pendiente_pago"] as const)("una reserva %s no cambia y informa su estado", async (estado) => {
    const { r } = await reservaEn(estado);
    const antes = await filaDe(r.id);

    expect(await validarReserva(db, r.id)).toEqual({ estado: "estado_distinto", actual: estado });
    expect(await filaDe(r.id)).toEqual(antes);
  });

  it("un identificador inexistente es no encontrada", async () => {
    expect(await validarReserva(db, 999)).toEqual({ estado: "no_encontrada" });
  });
});

describe("rechazarReserva", () => {
  it("devuelve a pendiente de pago, sin número, con el motivo y con las líneas activas", async () => {
    const { r } = await reservaEn("pendiente_validacion");

    expect(await rechazarReserva(db, r.id, "no coincide con ningún movimiento")).toEqual({ estado: "aplicada" });

    expect(await filaDe(r.id)).toMatchObject({
      estado: "pendiente_pago",
      numeroOperacion: null,
      motivoRechazo: "no coincide con ningún movimiento",
      validadaEn: null,
    });
    expect((await lineasDe(r.id)).every((l) => l.activa)).toBe(true);
  });

  it("el horario sigue ocupado: una reserva nueva en ese horario falla", async () => {
    const { r, m, s } = await reservaEn("pendiente_validacion");
    await rechazarReserva(db, r.id, "número mal escrito");

    const otra = await crearReservaIndividual(
      db,
      {
        clave: "00000000-0000-4000-8000-0000000000b1",
        servicioId: s.id,
        maquilladoraId: m.id,
        inicio: local("10:00"),
        nombre: "Otra clienta",
        telefono: "999111222",
      },
      AHORA,
    );

    expect(otra).toEqual({ estado: "horario_no_disponible" });
  });

  it("el número rechazado queda libre: otra reserva puede registrarlo", async () => {
    const { r } = await reservaEn("pendiente_validacion", { numeroOperacion: "OP-LIBRE" });
    await rechazarReserva(db, r.id, "no aparece");

    const otra = await crearReserva(db, { estado: "pendiente_validacion", numeroOperacion: "OP-LIBRE" });
    expect(otra.numeroOperacion).toBe("OP-LIBRE");
  });

  it("la reserva rechazada no vence aunque pasen varios días", async () => {
    const { r, m, s } = await reservaEn("pendiente_validacion", {
      creadaEn: new Date(AHORA.getTime() - 5 * 24 * 60 * 60_000),
    });
    await rechazarReserva(db, r.id, "no aparece");

    const cincoDiasDespues = new Date(AHORA.getTime() + 5 * 24 * 60 * 60_000);
    const vencida = await db.select({ id: reserva.id }).from(reserva).where(condicionVencida(cincoDiasDespues));
    expect(vencida).toEqual([]);

    const otra = await crearReservaIndividual(
      db,
      {
        clave: "00000000-0000-4000-8000-0000000000b2",
        servicioId: s.id,
        maquilladoraId: m.id,
        inicio: local("10:00"),
        nombre: "Otra clienta",
        telefono: "999111222",
      },
      AHORA,
    );
    expect(otra).toEqual({ estado: "horario_no_disponible" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_pago", motivoRechazo: "no aparece" });
  });

  it("después del rechazo la clienta informa un número nuevo y la reserva vuelve a validación sin motivo", async () => {
    const { r } = await reservaEn("pendiente_validacion");
    await rechazarReserva(db, r.id, "número mal escrito");
    const { token } = await filaDe(r.id);

    expect(await ingresarNumeroDeOperacion(db, { token, numero: "OP-2222" })).toEqual({ estado: "registrado" });

    expect(await filaDe(r.id)).toMatchObject({
      estado: "pendiente_validacion",
      numeroOperacion: "OP-2222",
      motivoRechazo: null,
    });
  });

  it("repetir el rechazo informa que ya estaba devuelta y no cambia el motivo", async () => {
    const { r } = await reservaEn("pendiente_validacion");
    await rechazarReserva(db, r.id, "primer motivo");

    expect(await rechazarReserva(db, r.id, "segundo motivo")).toEqual({ estado: "ya_aplicada", actual: "pendiente_pago" });
    expect((await filaDe(r.id)).motivoRechazo).toBe("primer motivo");
  });

  it.each(["confirmada", "cancelada", "pendiente_pago"] as const)("una reserva %s no se rechaza", async (estado) => {
    const { r } = await reservaEn(estado);
    const antes = await filaDe(r.id);

    expect(await rechazarReserva(db, r.id, "no aparece")).toEqual({ estado: "estado_distinto", actual: estado });
    expect(await filaDe(r.id)).toEqual(antes);
  });

  it("un identificador inexistente es no encontrada", async () => {
    expect(await rechazarReserva(db, 999, "no aparece")).toEqual({ estado: "no_encontrada" });
  });
});

describe("cancelarReserva", () => {
  it.each(["pendiente_pago", "pendiente_validacion", "confirmada"] as const)(
    "desde %s deja cancelada con motivo studio y la línea inactiva",
    async (estado) => {
      const { r } = await reservaEn(estado);

      expect(await cancelarReserva(db, r.id)).toEqual({ estado: "aplicada" });

      expect(await filaDe(r.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "studio" });
      expect((await lineasDe(r.id)).every((l) => !l.activa)).toBe(true);
    },
  );

  it("cancelar libera el horario: otra clienta puede reservarlo", async () => {
    const { r, m, s } = await reservaEn("pendiente_pago");
    await cancelarReserva(db, r.id);

    const otra = await crearReservaIndividual(
      db,
      {
        clave: "00000000-0000-4000-8000-0000000000b3",
        servicioId: s.id,
        maquilladoraId: m.id,
        inicio: local("10:00"),
        nombre: "Otra clienta",
        telefono: "999111222",
      },
      AHORA,
    );
    expect(otra).toMatchObject({ estado: "creada" });
  });

  it("una reserva grupal de tres integrantes inactiva las tres líneas", async () => {
    const { r, m, s } = await reservaEn("pendiente_pago");
    for (const [desde, hasta] of [
      ["11:00", "12:00"],
      ["12:00", "13:00"],
    ]) {
      await crearLinea(db, {
        reservaId: r.id,
        maquilladoraId: m.id,
        servicioId: s.id,
        persona: "Otra",
        inicio: local(desde),
        fin: local(hasta),
      });
    }
    expect(await lineasDe(r.id)).toHaveLength(3);

    await cancelarReserva(db, r.id);

    const lineas = await lineasDe(r.id);
    expect(lineas).toHaveLength(3);
    expect(lineas.every((l) => !l.activa)).toBe(true);
  });

  it("el reembolso queda pendiente solo si estaba confirmada", async () => {
    const confirmada = await reservaEn("confirmada");
    const enValidacion = await reservaEn("pendiente_validacion", { numeroOperacion: "OP-3333" });
    const sinPago = await reservaEn("pendiente_pago");

    await cancelarReserva(db, confirmada.r.id);
    await cancelarReserva(db, enValidacion.r.id);
    await cancelarReserva(db, sinPago.r.id);

    expect((await filaDe(confirmada.r.id)).estadoReembolso).toBe("pendiente");
    expect((await filaDe(enValidacion.r.id)).estadoReembolso).toBe("no_aplica");
    expect((await filaDe(sinPago.r.id)).estadoReembolso).toBe("no_aplica");
  });

  it("cancelar una cancelada no cambia nada, ni el motivo ni el reembolso", async () => {
    const { r } = await reservaEn("cancelada", { motivoCancelacion: "vencida" });
    const antes = await filaDe(r.id);

    expect(await cancelarReserva(db, r.id)).toEqual({ estado: "ya_aplicada", actual: "cancelada" });
    expect(await filaDe(r.id)).toEqual(antes);
    expect((await filaDe(r.id)).motivoCancelacion).toBe("vencida");
  });

  it("cancelar dos veces la misma reserva deja el motivo studio y no pisa el reembolso", async () => {
    const { r } = await reservaEn("confirmada");
    await cancelarReserva(db, r.id);
    await db.update(reserva).set({ estadoReembolso: "realizado" }).where(eq(reserva.id, r.id));

    expect(await cancelarReserva(db, r.id)).toEqual({ estado: "ya_aplicada", actual: "cancelada" });
    expect(await filaDe(r.id)).toMatchObject({ motivoCancelacion: "studio", estadoReembolso: "realizado" });
  });

  it("un identificador inexistente es no encontrada", async () => {
    expect(await cancelarReserva(db, 999)).toEqual({ estado: "no_encontrada" });
  });
});
