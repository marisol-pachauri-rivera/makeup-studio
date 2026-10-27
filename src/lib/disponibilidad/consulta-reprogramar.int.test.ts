import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo } from "@/db/schema";
import { aPartesLocales, deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva } from "../../../tests/support/fixtures";
import { consultarDisponibilidad } from "./consulta";
import type { DiaConHuecos } from "./huecos";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

// 2026-12-21 es lunes; 05:00 UTC = 00:00 en Lima.
const AHORA = new Date("2026-12-21T05:00:00Z");
const SERVICIO = { duracionMinutos: 60 };
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;
const horas = (dias: DiaConHuecos[]) =>
  (dias.find((d) => d.fecha === "2026-12-21")?.inicios ?? []).map((i) => aPartesLocales(i).hora);

/** Una maquilladora que trabaja los lunes de 09:00 a 12:00 y una reserva reciente (no vencida). */
async function escenario() {
  const m = await crearMaquilladora(db);
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "12:00" });
  const reciente = () => crearReserva(db, { creadaEn: AHORA });
  return { m, reciente };
}

describe("consultarDisponibilidad: modo reprogramar (ignorarLineaId)", () => {
  it("con el propio turno ignorado se ofrece 10:30 sobre un turno de 10:00 a 11:00; sin ignorarlo, no", async () => {
    const { m, reciente } = await escenario();
    const propia = await crearLinea(db, {
      reservaId: (await reciente()).id,
      maquilladoraId: m.id,
      inicio: local("10:00"),
      fin: local("11:00"),
    });

    const sin = await consultarDisponibilidad(db, { servicio: SERVICIO, maquilladoraId: m.id, ahora: AHORA });
    const con = await consultarDisponibilidad(db, {
      servicio: SERVICIO,
      maquilladoraId: m.id,
      ahora: AHORA,
      ignorarLineaId: propia.id,
    });

    expect(horas(sin)).toEqual(["09:00", "11:00"]);
    expect(horas(con)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("solo ignora esa línea: las de otras reservas siguen ocupando", async () => {
    const { m, reciente } = await escenario();
    const propia = await crearLinea(db, {
      reservaId: (await reciente()).id,
      maquilladoraId: m.id,
      inicio: local("09:00"),
      fin: local("10:00"),
    });
    await crearLinea(db, {
      reservaId: (await reciente()).id,
      maquilladoraId: m.id,
      inicio: local("10:00"),
      fin: local("11:00"),
    });

    const dias = await consultarDisponibilidad(db, {
      servicio: SERVICIO,
      maquilladoraId: m.id,
      ahora: AHORA,
      ignorarLineaId: propia.id,
    });

    expect(horas(dias)).toEqual(["09:00", "11:00"]);
  });
});
