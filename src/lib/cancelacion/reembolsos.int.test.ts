import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearReserva } from "../../../tests/support/fixtures";
import { listarReembolsosPendientes, marcarReembolsoRealizado } from "./reembolsos";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);
});

const base = new Date("2026-12-21T15:00:00Z");
const hace = (minutos: number) => new Date(base.getTime() - minutos * 60_000);

const cancelada = (extra: Partial<typeof reserva.$inferInsert> = {}) =>
  crearReserva(db, {
    estado: "cancelada",
    motivoCancelacion: "clienta",
    numeroOperacion: `OP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    ...extra,
  });

const reembolsoDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0].estadoReembolso;

describe("listarReembolsosPendientes", () => {
  it("lista solo los pendientes, con monto, número, nombre y teléfono, el más antiguo primero", async () => {
    const reciente = await cancelada({ estadoReembolso: "pendiente", creadaEn: hace(5), montoTotal: "200.00", nombreContacto: "Ana", telefonoContacto: "999000111" });
    const antigua = await cancelada({ estadoReembolso: "pendiente", creadaEn: hace(500), montoTotal: "350.50" });
    await cancelada({ estadoReembolso: "realizado" });
    await cancelada({ estadoReembolso: "no_aplica" });
    await crearReserva(db);

    const lista = await listarReembolsosPendientes(db);

    expect(lista.map((x) => x.id)).toEqual([antigua.id, reciente.id]);
    expect(lista[1]).toMatchObject({
      montoTotal: "200.00",
      numeroOperacion: reciente.numeroOperacion,
      nombreContacto: "Ana",
      telefonoContacto: "999000111",
    });
  });

  it("con la misma fecha desempata el identificador", async () => {
    const a = await cancelada({ estadoReembolso: "pendiente", creadaEn: hace(10) });
    const b = await cancelada({ estadoReembolso: "pendiente", creadaEn: hace(10) });
    expect((await listarReembolsosPendientes(db)).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it("sin pendientes devuelve una lista vacía", async () => {
    expect(await listarReembolsosPendientes(db)).toEqual([]);
  });
});

describe("marcarReembolsoRealizado", () => {
  it("pasa de pendiente a realizado y sale de la lista", async () => {
    const r = await cancelada({ estadoReembolso: "pendiente" });

    expect(await marcarReembolsoRealizado(db, r.id)).toEqual({ estado: "realizado" });

    expect(await reembolsoDe(r.id)).toBe("realizado");
    expect(await listarReembolsosPendientes(db)).toEqual([]);
  });

  it("repetirlo no es un error", async () => {
    const r = await cancelada({ estadoReembolso: "pendiente" });
    await marcarReembolsoRealizado(db, r.id);

    expect(await marcarReembolsoRealizado(db, r.id)).toEqual({ estado: "ya_realizado" });
    expect(await reembolsoDe(r.id)).toBe("realizado");
  });

  it("una reserva con reembolso no aplica se rechaza y no cambia", async () => {
    const r = await cancelada({ estadoReembolso: "no_aplica" });

    expect(await marcarReembolsoRealizado(db, r.id)).toEqual({ estado: "no_aplica" });
    expect(await reembolsoDe(r.id)).toBe("no_aplica");
  });

  it("un identificador inexistente es no encontrada", async () => {
    expect(await marcarReembolsoRealizado(db, 999)).toEqual({ estado: "no_encontrada" });
  });

  it("dos marcados simultáneos dejan uno realizado y otro ya realizado", async () => {
    const r = await cancelada({ estadoReembolso: "pendiente" });

    const resultados = await Promise.all([marcarReembolsoRealizado(db, r.id), marcarReembolsoRealizado(db, r.id)]);

    expect(resultados.map((x) => x.estado).sort()).toEqual(["realizado", "ya_realizado"]);
    expect(await reembolsoDe(r.id)).toBe("realizado");
  });
});
