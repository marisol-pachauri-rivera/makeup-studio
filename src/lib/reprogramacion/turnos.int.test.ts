import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import { obtenerTurnosReprogramables } from "./turnos";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-12-21T15:00:00Z");
const en = (horas: number) => new Date(AHORA.getTime() + horas * 3_600_000);

async function reservaCon(extra: Partial<typeof reserva.$inferInsert>, turnos: [number, string?][] = [[48]]) {
  const m = await crearMaquilladora(db, { nombre: "Lucía" });
  const s = await crearServicio(db, { nombre: "Peinado" });
  const r = await crearReserva(db, { creadaEn: AHORA, ...extra });
  const lineas = [];
  for (const [horas, persona] of turnos) {
    lineas.push(
      await crearLinea(db, {
        reservaId: r.id,
        maquilladoraId: m.id,
        servicioId: s.id,
        persona: persona ?? "Lucía",
        inicio: en(horas),
        fin: en(horas + 1),
      }),
    );
  }
  return { r, lineas };
}

const confirmada = { estado: "confirmada", numeroOperacion: "OP-1111" } as const;

describe("obtenerTurnosReprogramables", () => {
  it("una reserva confirmada devuelve su turno con id, maquilladora y servicio", async () => {
    const { r, lineas } = await reservaCon(confirmada);

    const turnos = await obtenerTurnosReprogramables(db, r.token, AHORA);

    expect(turnos).toEqual([
      {
        id: lineas[0].id,
        persona: "Lucía",
        servicio: "Peinado",
        maquilladora: "Lucía",
        maquilladoraId: lineas[0].maquilladoraId,
        inicio: en(48),
        fin: en(49),
        puedeReprogramar: true,
      },
    ]);
  });

  it.each([
    ["pendiente_pago", { estado: "pendiente_pago" as const }],
    ["pendiente_validacion", { estado: "pendiente_validacion" as const, numeroOperacion: "OP-1" }],
    ["cancelada", { estado: "cancelada" as const, motivoCancelacion: "studio" as const }],
  ])("una reserva %s no devuelve turnos", async (_estado, extra) => {
    const { r } = await reservaCon(extra);
    expect(await obtenerTurnosReprogramables(db, r.token, AHORA)).toEqual([]);
  });

  it("un grupo de tres devuelve los tres, ordenados, cada uno con su plazo", async () => {
    const { r } = await reservaCon(confirmada, [
      [60, "Tercera"],
      [10, "Primera"],
      [30, "Segunda"],
    ]);

    const turnos = await obtenerTurnosReprogramables(db, r.token, AHORA);

    expect(turnos.map((t) => [t.persona, t.puedeReprogramar])).toEqual([
      ["Primera", false],
      ["Segunda", true],
      ["Tercera", true],
    ]);
  });

  it("con exactamente 24 horas todavía se puede reprogramar", async () => {
    const { r } = await reservaCon(confirmada, [[24]]);
    expect((await obtenerTurnosReprogramables(db, r.token, AHORA))[0].puedeReprogramar).toBe(true);
  });

  it("un token ajeno o desconocido devuelve vacío y no mezcla reservas", async () => {
    const { r } = await reservaCon(confirmada);
    await reservaCon({ ...confirmada, numeroOperacion: "OP-2222" });

    expect(await obtenerTurnosReprogramables(db, "00000000-0000-4000-8000-000000000000", AHORA)).toEqual([]);
    expect(await obtenerTurnosReprogramables(db, r.token, AHORA)).toHaveLength(1);
  });
});
