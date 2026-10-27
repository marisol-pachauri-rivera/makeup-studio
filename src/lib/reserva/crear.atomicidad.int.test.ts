import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { horarioTrabajo, reserva, reservaLinea } from "@/db/schema";
import { deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio } from "../../../tests/support/fixtures";
import type { SolicitudReserva } from "./esquemas";

// Para forzar fallos que la revalidación normal evitaría, se fija qué horarios "se ofrecen".
const ofrecidos = vi.hoisted(() => ({ inicios: [] as Date[] }));
vi.mock("@/lib/disponibilidad/consulta", () => ({
  consultarDisponibilidad: async () => [{ fecha: "2026-12-21", inicios: ofrecidos.inicios }],
}));

const { crearReservaIndividual } = await import("./crear");

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  ofrecidos.inicios = [];
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-12-21T05:00:00Z");
const local = (hora: string) => deLocalAInstante(`2026-12-21T${hora}`) as Date;

async function escenario() {
  const m = await crearMaquilladora(db);
  const s = await crearServicio(db);
  await db.insert(horarioTrabajo).values({ maquilladoraId: m.id, diaSemana: 1, horaInicio: "09:00", horaFin: "13:00" });
  return { m, s };
}

const solicitud = (e: { m: { id: number }; s: { id: number } }): SolicitudReserva => ({
  clave: "11111111-1111-4111-8111-111111111111",
  servicioId: e.s.id,
  maquilladoraId: e.m.id,
  inicio: local("10:00"),
  nombre: "Lucía",
  telefono: "999111222",
});

describe("todo o nada", () => {
  it("si la línea choca después de insertar la reserva, no queda ninguna de las dos", async () => {
    const e = await escenario();
    // La línea ocupada ya existe, pero la revalidación (simulada) la deja pasar: el insert de la
    // reserva funciona y el de la línea lo rechaza la restricción de exclusión.
    const vigente = await crearReserva(db, { creadaEn: AHORA }); // reciente: no está vencida
    await crearLinea(db, {
      reservaId: vigente.id,
      maquilladoraId: e.m.id,
      servicioId: e.s.id,
      inicio: local("10:00"),
      fin: local("11:00"),
    });
    const reservasAntes = (await db.select().from(reserva)).length;
    ofrecidos.inicios = [local("10:00")];

    const r = await crearReservaIndividual(db, solicitud(e), AHORA);

    expect(r.estado).toBe("horario_no_disponible");
    expect(await db.select().from(reserva)).toHaveLength(reservasAntes);
    expect(await db.select().from(reservaLinea)).toHaveLength(1);
  });
});

describe("traducción del bloqueo mutuo", () => {
  const bloqueoMutuo = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });

  /** Una base que falla al abrir la transacción, como cuando Postgres aborta al perdedor de una carrera. */
  const baseQueFallaCon = (error: Error) =>
    new Proxy(db, {
      get(destino, propiedad) {
        if (propiedad === "transaction") return async () => Promise.reject(error);
        const valor = Reflect.get(destino, propiedad, destino);
        return typeof valor === "function" ? valor.bind(destino) : valor;
      },
    });

  it("40P01 se informa como horario ya no disponible, no como error técnico", async () => {
    const e = await escenario();
    ofrecidos.inicios = [local("10:00")];
    const r = await crearReservaIndividual(baseQueFallaCon(bloqueoMutuo()), solicitud(e), AHORA);
    expect(r).toEqual({ estado: "horario_no_disponible" });
  });

  it("40P01 envuelto en cause también", async () => {
    const e = await escenario();
    ofrecidos.inicios = [local("10:00")];
    const r = await crearReservaIndividual(
      baseQueFallaCon(new Error("Failed query", { cause: bloqueoMutuo() })),
      solicitud(e),
      AHORA,
    );
    expect(r).toEqual({ estado: "horario_no_disponible" });
  });

  it("si otro envío con la misma clave ya había ganado, se devuelve su reserva", async () => {
    const e = await escenario();
    ofrecidos.inicios = [local("10:00")];
    const ganadora = await crearReservaIndividual(db, solicitud(e), AHORA);
    if (ganadora.estado !== "creada") throw new Error("reserva esperada");

    // Este envío ya había pasado el atajo de idempotencia cuando el otro confirmó: simulamos que su
    // transacción falla y solo entonces se busca la clave.
    let primeraBusqueda = true;
    const base = new Proxy(db, {
      get(destino, propiedad) {
        if (propiedad === "select" && primeraBusqueda) {
          primeraBusqueda = false;
          return () => ({ from: () => ({ where: async () => [] }) });
        }
        if (propiedad === "transaction") return async () => Promise.reject(bloqueoMutuo());
        const valor = Reflect.get(destino, propiedad, destino);
        return typeof valor === "function" ? valor.bind(destino) : valor;
      },
    });

    const r = await crearReservaIndividual(base, solicitud(e), AHORA);
    expect(r).toEqual({ estado: "creada", token: ganadora.token, repetida: true });
  });

  it("un error que no es un choque se relanza", async () => {
    const e = await escenario();
    ofrecidos.inicios = [local("10:00")];
    const error = Object.assign(new Error("el disco se llenó"), { code: "53100" });
    await expect(crearReservaIndividual(baseQueFallaCon(error), solicitud(e), AHORA)).rejects.toThrow("el disco se llenó");
  });

  it("una unicidad ajena a la clave se relanza", async () => {
    const e = await escenario();
    ofrecidos.inicios = [local("10:00")];
    const error = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "reserva_token_unico" });
    await expect(crearReservaIndividual(baseQueFallaCon(error), solicitud(e), AHORA)).rejects.toThrow("duplicate key");
  });
});
