import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../../../tests/support/fixtures";
import { numeroOperacionSchema } from "./esquemas";
import { ingresarNumeroDeOperacion } from "./ingreso";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const minutosAtras = (m: number) => new Date(Date.now() - m * 60_000);

/** Una reserva con una línea; `extra` ajusta la reserva (estado, número, creadaEn, motivos…). */
async function reservaCon(extra: Parameters<typeof crearReserva>[1] = {}) {
  const r = await crearReserva(db, extra);
  const m = await crearMaquilladora(db, { nombre: `M${r.id}` });
  const s = await crearServicio(db);
  await crearLinea(db, {
    reservaId: r.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: hora("10:00", `2027-01-${String(10 + r.id).padStart(2, "0")}`),
    fin: hora("11:00", `2027-01-${String(10 + r.id).padStart(2, "0")}`),
  });
  return r;
}

const filaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];
const ingresar = (token: string, numero: string) => ingresarNumeroDeOperacion(db, { token, numero });

describe("ingreso válido", () => {
  it("guarda el número y pasa la reserva a pendiente de validación", async () => {
    const r = await reservaCon();
    expect(await ingresar(r.token, "OP-123456")).toEqual({ estado: "registrado" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-123456" });
  });

  it("guarda el número normalizado cuando se pasa por el esquema", async () => {
    const r = await reservaCon();
    await ingresar(r.token, numeroOperacionSchema.parse("  op-123456 "));
    expect((await filaDe(r.id)).numeroOperacion).toBe("OP-123456");
  });

  it("no toca las demás reservas ni las líneas", async () => {
    const a = await reservaCon();
    const b = await reservaCon();
    await ingresar(a.token, "OP-1111");
    expect((await filaDe(b.id)).estado).toBe("pendiente_pago");
    expect((await db.select().from(reservaLinea)).every((l) => l.activa)).toBe(true);
  });

  it("una reserva grupal con varias líneas pasa entera: el número es de la reserva", async () => {
    const r = await reservaCon();
    const m = await crearMaquilladora(db, { nombre: "Otra" });
    const s = await crearServicio(db);
    await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora("12:00"), fin: hora("13:00") });
    await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora("14:00"), fin: hora("15:00") });

    expect(await ingresar(r.token, "OP-GRUPO")).toEqual({ estado: "registrado" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-GRUPO" });
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, r.id)))).toHaveLength(3);
  });

  it("el plazo pasado sin cancelar todavía acepta el número (ADR 0003)", async () => {
    const r = await reservaCon({ creadaEn: minutosAtras(25) });
    expect(await ingresar(r.token, "OP-TARDE")).toEqual({ estado: "registrado" });
    expect((await filaDe(r.id)).estado).toBe("pendiente_validacion");
  });

  it("una reserva devuelta por un rechazo acepta un número nuevo y el motivo se limpia", async () => {
    const r = await reservaCon({ creadaEn: minutosAtras(600), motivoRechazo: "No coincide con ningún pago" });
    expect(await ingresar(r.token, "OP-CORREGIDO")).toEqual({ estado: "registrado" });
    expect(await filaDe(r.id)).toMatchObject({
      estado: "pendiente_validacion",
      numeroOperacion: "OP-CORREGIDO",
      motivoRechazo: null,
    });
  });
});

describe("número ya usado", () => {
  it("se rechaza y la reserva sigue pendiente de pago y sin número", async () => {
    await reservaCon({ estado: "pendiente_validacion", numeroOperacion: "OP-1111" });
    const r = await reservaCon();

    expect(await ingresar(r.token, "OP-1111")).toEqual({ estado: "numero_usado" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_pago", numeroOperacion: null });
  });

  it("compara el número normalizado: 'op-1111' es el mismo que 'OP-1111'", async () => {
    await reservaCon({ estado: "pendiente_validacion", numeroOperacion: "OP-1111" });
    const r = await reservaCon();
    expect(await ingresar(r.token, numeroOperacionSchema.parse("op-1111"))).toEqual({ estado: "numero_usado" });
  });

  it("un número que una reserva cancelada conserva también cuenta como usado", async () => {
    await reservaCon({ estado: "cancelada", motivoCancelacion: "studio", numeroOperacion: "OP-2222" });
    const r = await reservaCon();
    expect(await ingresar(r.token, "OP-2222")).toEqual({ estado: "numero_usado" });
  });

  it("después del rechazo del studio el número queda libre para otra reserva", async () => {
    const primera = await reservaCon({ estado: "pendiente_validacion", numeroOperacion: "OP-3333" });
    await db
      .update(reserva)
      .set({ estado: "pendiente_pago", numeroOperacion: null, motivoRechazo: "No coincide" })
      .where(eq(reserva.id, primera.id));
    const otra = await reservaCon();
    expect(await ingresar(otra.token, "OP-3333")).toEqual({ estado: "registrado" });
  });
});

describe("reservas que ya no aceptan un número", () => {
  it("cancelada por vencimiento: se rechaza como vencida y no se modifica", async () => {
    const r = await reservaCon({ estado: "cancelada", motivoCancelacion: "vencida" });
    expect(await ingresar(r.token, "OP-4444")).toEqual({ estado: "vencida" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida", numeroOperacion: null });
  });

  it.each(["studio", "clienta"] as const)("cancelada por %s: se rechaza como cancelada", async (motivo) => {
    const r = await reservaCon({ estado: "cancelada", motivoCancelacion: motivo });
    expect(await ingresar(r.token, "OP-5555")).toEqual({ estado: "cancelada" });
    expect((await filaDe(r.id)).numeroOperacion).toBeNull();
  });

  it("confirmada con otro número: ya confirmada, sin cambios", async () => {
    const r = await reservaCon({ estado: "confirmada", numeroOperacion: "OP-6666" });
    expect(await ingresar(r.token, "OP-7777")).toEqual({ estado: "ya_confirmada" });
    expect((await filaDe(r.id)).numeroOperacion).toBe("OP-6666");
  });

  it("en validación con otro número: pago ya informado, y el guardado no cambia", async () => {
    const r = await reservaCon({ estado: "pendiente_validacion", numeroOperacion: "OP-8888" });
    expect(await ingresar(r.token, "OP-9999")).toEqual({ estado: "pago_ya_informado" });
    expect((await filaDe(r.id)).numeroOperacion).toBe("OP-8888");
  });

  it("un token inexistente no encuentra ninguna reserva", async () => {
    await reservaCon();
    expect(await ingresar("00000000-0000-4000-8000-000000000000", "OP-0000")).toEqual({ estado: "no_encontrada" });
  });
});

describe("reenvío del mismo número", () => {
  it("el doble clic es un éxito y deja un solo número", async () => {
    const r = await reservaCon();
    expect(await ingresar(r.token, "OP-1212")).toEqual({ estado: "registrado" });
    expect(await ingresar(r.token, "OP-1212")).toEqual({ estado: "registrado" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-1212" });
  });

  it("también es un éxito si ya está confirmada con ese mismo número", async () => {
    const r = await reservaCon({ estado: "confirmada", numeroOperacion: "OP-1313" });
    expect(await ingresar(r.token, "OP-1313")).toEqual({ estado: "registrado" });
    expect((await filaDe(r.id)).estado).toBe("confirmada");
  });

  it("dos envíos simultáneos del mismo número de la misma reserva terminan en un solo número", async () => {
    const r = await reservaCon();
    const [a, b] = await Promise.all([ingresar(r.token, "OP-1414"), ingresar(r.token, "OP-1414")]);
    expect(a).toEqual({ estado: "registrado" });
    expect(b).toEqual({ estado: "registrado" });
    expect(await filaDe(r.id)).toMatchObject({ estado: "pendiente_validacion", numeroOperacion: "OP-1414" });
  });
});

describe("coherencia con la base", () => {
  it("el estado y el número cambian juntos: nunca queda una reserva con número en pendiente de pago", async () => {
    const r = await reservaCon();
    await ingresar(r.token, "OP-1515");
    const { rows } = await db.execute<{ n: string }>(
      sql`select count(*) as n from reserva where (estado = 'pendiente_pago') <> (numero_operacion is null) and estado <> 'cancelada'`,
    );
    expect(rows[0].n).toBe("0");
  });
});
