import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bloqueoAgenda, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, hora } from "../../../tests/support/fixtures";
import { bloqueoSchema } from "./esquemas";
import { agregarBloqueo, listarBloqueos, quitarBloqueo } from "./bloqueos";
import { aPartesLocales } from "./zona-horaria";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

/** Pasa por el esquema, igual que la acción: `inicio` y `fin` son hora local de Lima. */
const datos = (inicio: string, fin: string, motivo = "Vacaciones") => bloqueoSchema.parse({ inicio, fin, motivo });

const AHORA = new Date("2026-06-15T15:00:00Z"); // 10:00 en Lima

describe("agregarBloqueo", () => {
  it("guarda el bloqueo y lo devuelve con la misma hora local", async () => {
    const m = await crearMaquilladora(db);
    const creado = await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-26T18:30"));

    expect(creado).toBeDefined();
    const [guardado] = await listarBloqueos(db, m.id, AHORA);
    expect(guardado.inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
    expect(aPartesLocales(guardado.inicio).texto).toBe("2026-12-24T09:00");
    expect(aPartesLocales(guardado.fin).texto).toBe("2026-12-26T18:30");
    expect(guardado.motivo).toBe("Vacaciones");
  });

  it("acepta un bloqueo que se solapa con otro", async () => {
    const m = await crearMaquilladora(db);
    await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-26T18:00"));
    expect(await agregarBloqueo(db, m.id, datos("2026-12-25T09:00", "2026-12-27T18:00", "Feriado"))).toBeDefined();
    expect(await listarBloqueos(db, m.id, AHORA)).toHaveLength(2);
  });

  it("devuelve undefined si la maquilladora no existe y no guarda nada", async () => {
    expect(await agregarBloqueo(db, 999, datos("2026-12-24T09:00", "2026-12-26T18:00"))).toBeUndefined();
    expect(await db.select().from(bloqueoAgenda)).toHaveLength(0);
  });

  it("no modifica un turno ya reservado dentro del bloqueo", async () => {
    const m = await crearMaquilladora(db);
    const linea = await crearLinea(db, {
      maquilladoraId: m.id,
      inicio: new Date("2026-12-24T16:00:00Z"),
      fin: new Date("2026-12-24T17:00:00Z"),
    });

    await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-24T18:00"));

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada).toMatchObject({ activa: true, inicio: linea.inicio, fin: linea.fin });
  });
});

describe("listarBloqueos", () => {
  it("pone primero los que no terminaron, por inicio ascendente, y después los pasados", async () => {
    const m = await crearMaquilladora(db);
    await agregarBloqueo(db, m.id, datos("2026-01-10T09:00", "2026-01-11T09:00", "Pasado viejo"));
    await agregarBloqueo(db, m.id, datos("2026-09-01T09:00", "2026-09-02T09:00", "Futuro lejano"));
    await agregarBloqueo(db, m.id, datos("2026-06-01T09:00", "2026-06-02T09:00", "Pasado reciente"));
    await agregarBloqueo(db, m.id, datos("2026-07-01T09:00", "2026-07-02T09:00", "Futuro cercano"));

    expect((await listarBloqueos(db, m.id, AHORA)).map((b) => [b.motivo, b.pasado])).toEqual([
      ["Futuro cercano", false],
      ["Futuro lejano", false],
      ["Pasado reciente", true],
      ["Pasado viejo", true],
    ]);
  });

  it("trata como no terminado un bloqueo en curso", async () => {
    const m = await crearMaquilladora(db);
    await agregarBloqueo(db, m.id, datos("2026-06-15T08:00", "2026-06-15T12:00", "En curso"));
    expect((await listarBloqueos(db, m.id, AHORA))[0]).toMatchObject({ motivo: "En curso", pasado: false });
  });

  it("trata como pasado el que termina justo ahora", async () => {
    const m = await crearMaquilladora(db);
    await agregarBloqueo(db, m.id, datos("2026-06-15T08:00", "2026-06-15T10:00", "Termina ahora"));
    expect((await listarBloqueos(db, m.id, AHORA))[0].pasado).toBe(true);
  });

  it("solo trae los de la maquilladora pedida", async () => {
    const a = await crearMaquilladora(db, { nombre: "Ana" });
    const b = await crearMaquilladora(db, { nombre: "Bea" });
    await agregarBloqueo(db, a.id, datos("2026-12-24T09:00", "2026-12-25T09:00", "De Ana"));
    await agregarBloqueo(db, b.id, datos("2026-12-24T09:00", "2026-12-25T09:00", "De Bea"));
    expect((await listarBloqueos(db, a.id, AHORA)).map((x) => x.motivo)).toEqual(["De Ana"]);
  });

  it("devuelve una lista vacía sin bloqueos", async () => {
    const m = await crearMaquilladora(db);
    expect(await listarBloqueos(db, m.id, AHORA)).toEqual([]);
  });
});

describe("quitarBloqueo", () => {
  it("borra el bloqueo y deja los demás", async () => {
    const m = await crearMaquilladora(db);
    const uno = await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-25T09:00", "Uno"));
    await agregarBloqueo(db, m.id, datos("2026-12-28T09:00", "2026-12-29T09:00", "Dos"));

    expect(await quitarBloqueo(db, m.id, uno!.id)).toBe(true);
    expect((await listarBloqueos(db, m.id, AHORA)).map((b) => b.motivo)).toEqual(["Dos"]);
  });

  it("no falla si el bloqueo ya no existe", async () => {
    const m = await crearMaquilladora(db);
    expect(await quitarBloqueo(db, m.id, 999)).toBe(false);
  });

  it("repetir la baja no falla", async () => {
    const m = await crearMaquilladora(db);
    const b = await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-25T09:00"));
    expect(await quitarBloqueo(db, m.id, b!.id)).toBe(true);
    expect(await quitarBloqueo(db, m.id, b!.id)).toBe(false);
  });

  it("no borra un bloqueo que pertenece a otra maquilladora", async () => {
    const a = await crearMaquilladora(db, { nombre: "Ana" });
    const b = await crearMaquilladora(db, { nombre: "Bea" });
    const bloqueo = await agregarBloqueo(db, a.id, datos("2026-12-24T09:00", "2026-12-25T09:00"));

    expect(await quitarBloqueo(db, b.id, bloqueo!.id)).toBe(false);
    expect(await db.select().from(bloqueoAgenda).where(eq(bloqueoAgenda.id, bloqueo!.id))).toHaveLength(1);
  });

  it("no modifica las líneas de reserva", async () => {
    const m = await crearMaquilladora(db);
    const linea = await crearLinea(db, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });
    const b = await agregarBloqueo(db, m.id, datos("2026-12-24T09:00", "2026-12-25T09:00"));

    await quitarBloqueo(db, m.id, b!.id);

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada.activa).toBe(true);
  });
});
