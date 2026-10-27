import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../../../tests/support/fixtures";
import { obtenerReservaPorToken } from "./estado";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

async function reservaConLinea(extra: Parameters<typeof crearReserva>[1] = {}) {
  const m = await crearMaquilladora(db, { nombre: "Lucía" });
  const s = await crearServicio(db, { nombre: "Maquillaje social", precio: "350.50" });
  const r = await crearReserva(db, { montoTotal: "350.50", ...extra });
  await crearLinea(db, {
    reservaId: r.id,
    servicioId: s.id,
    maquilladoraId: m.id,
    persona: "Ana Gómez",
    precio: "350.50",
    inicio: hora("10:00"),
    fin: hora("11:00"),
  });
  return r;
}

describe("obtenerReservaPorToken", () => {
  it("devuelve estado, monto y la línea con nombres de servicio y maquilladora", async () => {
    const r = await reservaConLinea();
    const estado = await obtenerReservaPorToken(db, r.token);

    expect(estado).toMatchObject({ estado: "pendiente_pago", montoTotal: "350.50" });
    expect(estado?.creadaEn).toBeInstanceOf(Date);
    expect(estado?.lineas).toEqual([
      {
        persona: "Ana Gómez",
        servicio: "Maquillaje social",
        maquilladora: "Lucía",
        inicio: hora("10:00"),
        fin: hora("11:00"),
        precio: "350.50",
        activa: true,
      },
    ]);
  });

  it("devuelve undefined con un token que no existe", async () => {
    await reservaConLinea();
    expect(await obtenerReservaPorToken(db, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("no mezcla reservas: cada token trae solo la suya", async () => {
    const a = await reservaConLinea();
    const b = await reservaConLinea({ nombreContacto: "Otra" });
    const deA = await obtenerReservaPorToken(db, a.token);
    const deB = await obtenerReservaPorToken(db, b.token);
    expect(deA?.lineas).toHaveLength(1);
    expect(deB?.lineas).toHaveLength(1);
  });

  it("incluye la línea inactiva de una reserva cancelada", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db, { estado: "cancelada", motivoCancelacion: "clienta" });
    await crearLinea(db, {
      reservaId: r.id,
      servicioId: s.id,
      maquilladoraId: m.id,
      inicio: hora("10:00"),
      fin: hora("11:00"),
      activa: false,
    });
    const estado = await obtenerReservaPorToken(db, r.token);
    expect(estado?.estado).toBe("cancelada");
    expect(estado?.lineas).toHaveLength(1);
    expect(estado?.lineas[0].activa).toBe(false);
  });

  it("ordena las líneas por inicio", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db);
    await crearLinea(db, { reservaId: r.id, servicioId: s.id, maquilladoraId: m.id, persona: "Segunda", inicio: hora("12:00"), fin: hora("13:00") });
    await crearLinea(db, { reservaId: r.id, servicioId: s.id, maquilladoraId: m.id, persona: "Primera", inicio: hora("10:00"), fin: hora("11:00") });
    expect((await obtenerReservaPorToken(db, r.token))?.lineas.map((l) => l.persona)).toEqual(["Primera", "Segunda"]);
  });

  it("devuelve undefined para una reserva sin líneas", async () => {
    const r = await crearReserva(db);
    expect(await obtenerReservaPorToken(db, r.token)).toBeUndefined();
  });

  it("refleja el estado actual de la reserva", async () => {
    const r = await reservaConLinea({ estado: "pendiente_validacion", numeroOperacion: "OP-1" });
    expect((await obtenerReservaPorToken(db, r.token))?.estado).toBe("pendiente_validacion");
  });
});

describe("plazo de pago y motivo de cancelación", () => {
  const MINUTO = 60_000;

  it("una reserva pendiente de pago puede vencer: el plazo es la creación más 20 minutos", async () => {
    const creada = new Date("2026-12-21T15:00:00Z");
    const r = await reservaConLinea({ creadaEn: creada });
    const estado = await obtenerReservaPorToken(db, r.token);
    expect(estado?.plazoPagoHasta?.getTime()).toBe(creada.getTime() + 20 * MINUTO);
    expect(estado?.motivoCancelacion).toBeNull();
  });

  it("una reserva devuelta por un rechazo no tiene plazo, porque no vence", async () => {
    const r = await reservaConLinea({ motivoRechazo: "No coincide con ningún pago" });
    expect((await obtenerReservaPorToken(db, r.token))?.plazoPagoHasta).toBeNull();
  });

  it.each([
    ["pendiente_validacion", { estado: "pendiente_validacion" as const, numeroOperacion: "OP-1" }],
    ["confirmada", { estado: "confirmada" as const, numeroOperacion: "OP-2" }],
    ["cancelada", { estado: "cancelada" as const, motivoCancelacion: "studio" as const }],
  ])("una reserva %s no tiene plazo", async (_estado, extra) => {
    const r = await reservaConLinea(extra);
    expect((await obtenerReservaPorToken(db, r.token))?.plazoPagoHasta).toBeNull();
  });

  it.each(["vencida", "clienta", "studio"] as const)("devuelve el motivo de cancelación %s", async (motivo) => {
    const r = await reservaConLinea({ estado: "cancelada", motivoCancelacion: motivo });
    expect((await obtenerReservaPorToken(db, r.token))?.motivoCancelacion).toBe(motivo);
  });

  it("devuelve el motivo del rechazo de una reserva que espera un número nuevo", async () => {
    const r = await reservaConLinea({ motivoRechazo: "Texto del studio" });
    expect((await obtenerReservaPorToken(db, r.token))?.motivoRechazo).toBe("Texto del studio");
  });

  it("sin rechazo el motivo es null", async () => {
    const r = await reservaConLinea();
    expect((await obtenerReservaPorToken(db, r.token))?.motivoRechazo).toBeNull();
  });

  it.each([
    ["pendiente_validacion", { estado: "pendiente_validacion" as const, numeroOperacion: "OP-1" }],
    ["confirmada", { estado: "confirmada" as const, numeroOperacion: "OP-2" }],
    ["cancelada", { estado: "cancelada" as const, motivoCancelacion: "studio" as const }],
  ])("una reserva %s no devuelve motivo de rechazo, aunque la fila lo conserve", async (_estado, extra) => {
    const r = await reservaConLinea({ ...extra, motivoRechazo: "Texto viejo" });
    const estado = await obtenerReservaPorToken(db, r.token);
    expect(estado?.motivoRechazo).toBeNull();
    expect(JSON.stringify(estado)).not.toContain("Texto viejo");
  });
});

describe("reembolso y plazo para cancelar", () => {
  it.each(["no_aplica", "pendiente", "realizado"] as const)("devuelve el estado de reembolso %s", async (estadoReembolso) => {
    const r = await reservaConLinea({ estado: "cancelada", motivoCancelacion: "clienta", estadoReembolso });
    expect((await obtenerReservaPorToken(db, r.token))?.estadoReembolso).toBe(estadoReembolso);
  });

  it("una reserva viva puede cancelarse hasta 24 horas antes de su primer turno", async () => {
    const r = await reservaConLinea();
    // El turno de `reservaConLinea` empieza a las 10:00 UTC del día fijo del fixture.
    expect((await obtenerReservaPorToken(db, r.token))?.puedeCancelarHasta).toEqual(
      new Date(hora("10:00").getTime() - 24 * 3_600_000),
    );
  });

  it("en un grupo el plazo cuenta desde el primer turno activo", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db);
    await crearLinea(db, { reservaId: r.id, servicioId: s.id, maquilladoraId: m.id, inicio: hora("14:00"), fin: hora("15:00") });
    await crearLinea(db, { reservaId: r.id, servicioId: s.id, maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });
    expect((await obtenerReservaPorToken(db, r.token))?.puedeCancelarHasta).toEqual(
      new Date(hora("10:00").getTime() - 24 * 3_600_000),
    );
  });

  it("una reserva cancelada no tiene plazo para cancelar", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const r = await crearReserva(db, { estado: "cancelada", motivoCancelacion: "clienta" });
    await crearLinea(db, { reservaId: r.id, servicioId: s.id, maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00"), activa: false });
    expect((await obtenerReservaPorToken(db, r.token))?.puedeCancelarHasta).toBeNull();
  });
});

describe("privacidad de la lectura", () => {
  it("no selecciona ni devuelve teléfono, nombre de contacto, número de operación ni clave", async () => {
    const consultas: string[] = [];
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const dbConRegistro = drizzle(pool, { logger: { logQuery: (q) => consultas.push(q) } });
    try {
      const r = await reservaConLinea({
        estado: "pendiente_validacion",
        numeroOperacion: "OP-SECRETO",
        nombreContacto: "Contacto Secreto",
        telefonoContacto: "999000111",
        claveIdempotencia: "22222222-2222-4222-8222-222222222222",
      });

      const estado = await obtenerReservaPorToken(dbConRegistro, r.token);

      const sqlEmitido = consultas.join("\n").toLowerCase();
      for (const prohibido of ["telefono_contacto", "nombre_contacto", "numero_operacion", "clave_idempotencia"]) {
        expect(sqlEmitido).not.toContain(prohibido);
      }
      expect(JSON.stringify(estado)).not.toMatch(/Secreto|999000111|OP-SECRETO|2222-4222/);
      expect(Object.keys(estado ?? {}).sort()).toEqual([
        "creadaEn",
        "estado",
        "estadoReembolso",
        "lineas",
        "montoTotal",
        "motivoCancelacion",
        "motivoRechazo",
        "plazoPagoHasta",
        "puedeCancelarHasta",
      ]);
    } finally {
      await pool.end();
    }
  });
});
