import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../../../tests/support/fixtures";
import { liberarVencidasEnConflicto } from "./vencimiento";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-03-02T12:00:00Z");
let contador = 0;
const vigente = () =>
  crearReserva(db, { creadaEn: AHORA, estado: "confirmada", numeroOperacion: `OP-${String(++contador).padStart(4, "0")}` });
const vencida = () => crearReserva(db, { creadaEn: new Date(AHORA.getTime() - 30 * 60_000) });

describe("liberarVencidasEnConflicto con excluirLineaId", () => {
  it("la línea excluida no cuenta como bloqueante, aunque se cruce con el destino", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const propia = await crearLinea(db, {
      reservaId: (await vigente()).id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: hora("10:00"),
      fin: hora("11:00"),
    });
    const v = await vencida();
    await crearLinea(db, { reservaId: v.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora("11:00"), fin: hora("12:00") });

    // El destino 10:30-11:30 se cruza con la propia línea y con la vencida.
    const r = await db.transaction((tx) =>
      liberarVencidasEnConflicto(
        tx,
        { maquilladoraId: m.id, inicio: hora("10:30"), fin: hora("11:30"), excluirLineaId: propia.id },
        AHORA,
      ),
    );

    expect(r).toEqual({ canceladas: [v.id], bloqueantes: 0 });
    expect((await db.select().from(reserva).where(eq(reserva.id, v.id)))[0]).toMatchObject({
      estado: "cancelada",
      motivoCancelacion: "vencida",
    });
  });

  it("sin excluirla, la misma línea sí es bloqueante (el comportamiento de siempre)", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    await crearLinea(db, {
      reservaId: (await vigente()).id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: hora("10:00"),
      fin: hora("11:00"),
    });

    const r = await db.transaction((tx) =>
      liberarVencidasEnConflicto(tx, { maquilladoraId: m.id, inicio: hora("10:30"), fin: hora("11:30") }, AHORA),
    );

    expect(r).toEqual({ canceladas: [], bloqueantes: 1 });
  });

  it("otra línea vigente en el destino sigue siendo bloqueante aunque se excluya la propia", async () => {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const propia = await crearLinea(db, {
      reservaId: (await vigente()).id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: hora("09:00"),
      fin: hora("10:00"),
    });
    await crearLinea(db, {
      reservaId: (await vigente()).id,
      maquilladoraId: m.id,
      servicioId: s.id,
      inicio: hora("10:00"),
      fin: hora("11:00"),
    });

    const r = await db.transaction((tx) =>
      liberarVencidasEnConflicto(
        tx,
        { maquilladoraId: m.id, inicio: hora("09:30"), fin: hora("10:30"), excluirLineaId: propia.id },
        AHORA,
      ),
    );

    expect(r.bloqueantes).toBe(1);
  });
});
