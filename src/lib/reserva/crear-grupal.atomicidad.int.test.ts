import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearReserva } from "../../../tests/support/fixtures";
import {
  antes,
  clave,
  local,
  MADRUGADA,
  mundoGrupal,
  persona,
  solicitudGrupal,
  trioBase,
  type MundoGrupal,
} from "../../../tests/support/grupo";

// Para forzar choques tardíos (después de la revalidación) se fija qué horarios "se ofrecen" y se
// puede hacer fallar la n-ésima inserción de una línea del grupo.
const control = vi.hoisted(() => ({ inicios: [] as Date[], llamadas: 0, fallarEn: 0 }));

vi.mock("@/lib/disponibilidad/consulta", () => ({
  consultarDisponibilidad: async () => [{ fecha: "2026-12-21", inicios: control.inicios }],
}));

vi.mock("./vencimiento", async (importOriginal) => {
  const real = await importOriginal<typeof import("./vencimiento")>();
  return {
    ...real,
    insertarLineaLiberandoVencidas: async (...args: Parameters<typeof real.insertarLineaLiberandoVencidas>) => {
      control.llamadas++;
      if (control.fallarEn === control.llamadas) throw new Error("falla inyectada");
      return real.insertarLineaLiberandoVencidas(...args);
    },
  };
});

const { crearReservaGrupal } = await import("./crear-grupal");
const { crearReservaIndividual } = await import("./crear");

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

let w: MundoGrupal;
beforeEach(async () => {
  control.llamadas = 0;
  control.fallarEn = 0;
  control.inicios = ["09:00", "10:00", "11:00", "12:00"].map(local);
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
  w = await mundoGrupal(db);
});

const totales = async () => ({
  reservas: (await db.select().from(reserva)).length,
  lineas: (await db.select().from(reservaLinea)).length,
});

async function ocupar(m: { id: number }, desde: string, hasta: string, creadaEn = MADRUGADA) {
  const r = await crearReserva(db, { creadaEn });
  await crearLinea(db, { reservaId: r.id, maquilladoraId: m.id, servicioId: w.s60.id, inicio: local(desde), fin: local(hasta) });
  return r;
}

describe("todo o nada", () => {
  it("un fallo al insertar la tercera línea no deja ninguna reserva ni ninguna línea", async () => {
    control.fallarEn = 3;

    await expect(crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA)).rejects.toThrow("falla inyectada");

    // Las dos primeras líneas y la reserva ya se habían insertado dentro de la transacción.
    expect(control.llamadas).toBe(3);
    expect(await totales()).toEqual({ reservas: 0, lineas: 0 });
  });

  it("un fallo al insertar la primera línea tampoco deja la reserva", async () => {
    control.fallarEn = 1;
    await expect(crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA)).rejects.toThrow("falla inyectada");
    expect(await totales()).toEqual({ reservas: 0, lineas: 0 });
  });

  it("si la última línea choca, el grupo no se guarda y se señala a esa integrante", async () => {
    await ocupar(w.m1, "11:00", "12:00"); // el horario de Carla, que "se ofrecía" al revalidar
    const previo = await totales();

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r).toMatchObject({ estado: "rechazada", noDisponibles: [], solapamientos: [] });
    if (r.estado !== "rechazada") throw new Error("rechazo esperado");
    expect(r.horariosNoDisponibles).toContain(2);
    expect(await totales()).toEqual(previo);
  });

  it("un grupo que choca con una reserva individual en su última línea no guarda ni las líneas ya insertadas", async () => {
    const individual = await crearReservaIndividual(
      db,
      { clave: clave(), servicioId: w.s30.id, maquilladoraId: w.m1.id, inicio: local("11:00"), nombre: "Individual", telefono: "999000111" },
      MADRUGADA,
    );
    expect(individual.estado).toBe("creada");
    const previo = await totales();

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r).toMatchObject({ estado: "rechazada" });
    expect(await totales()).toEqual(previo);
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.persona, "Individual")))).toHaveLength(1);
  });

  it("si un horario liberado de una vencida precede a una línea que no entra, la vencida sigue sin cancelar", async () => {
    const vencida = await ocupar(w.m1, "10:00", "11:00", antes(30)); // el horario de Ana
    await ocupar(w.m1, "11:00", "12:00"); // el de Carla, vigente

    const r = await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA);

    expect(r.estado).toBe("rechazada");
    // Para la primera línea se canceló la vencida dentro de la transacción; al fallar la tercera, se deshizo.
    const [fila] = await db.select().from(reserva).where(eq(reserva.id, vencida.id));
    expect(fila).toMatchObject({ estado: "pendiente_pago", motivoCancelacion: null });
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, vencida.id))).map((l) => l.activa)).toEqual([true]);
    expect((await totales()).reservas).toBe(2);
  });
});

describe("carrera entre grupos", () => {
  it("dos grupos simultáneos por el mismo horario: uno se crea completo y el otro se rechaza, sin filas a medias", async () => {
    for (let ronda = 0; ronda < 10; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);

      // El segundo grupo pide los mismos horarios en el orden inverso: así también puede producirse
      // el bloqueo mutuo (40P01) que Postgres le devuelve al perdedor.
      const a = solicitudGrupal([persona("A1", w.s60, w.m1, "10:00"), persona("A2", w.s60, w.m2, "10:00")]);
      const b = solicitudGrupal([persona("B1", w.s60, w.m2, "10:00"), persona("B2", w.s60, w.m1, "10:00")]);

      const resultados = await Promise.all([crearReservaGrupal(db, a, MADRUGADA), crearReservaGrupal(db, b, MADRUGADA)]);

      expect(resultados.map((r) => r.estado).sort()).toEqual(["creada", "rechazada"]);
      const perdedor = resultados.find((r) => r.estado === "rechazada");
      if (perdedor?.estado !== "rechazada") throw new Error("rechazo esperado");
      expect(perdedor.horariosNoDisponibles.length).toBeGreaterThan(0);
      expect(await totales()).toEqual({ reservas: 1, lineas: 2 });
    }
  });

  it("con varios grupos a la vez exactamente uno se queda con el horario", async () => {
    const grupos = Array.from({ length: 5 }, (_, i) =>
      solicitudGrupal([persona(`G${i}a`, w.s60, w.m1, "10:00"), persona(`G${i}b`, w.s60, w.m2, "10:00")]),
    );
    const resultados = await Promise.all(grupos.map((g) => crearReservaGrupal(db, g, MADRUGADA)));
    expect(resultados.filter((r) => r.estado === "creada")).toHaveLength(1);
    expect(resultados.filter((r) => r.estado === "rechazada")).toHaveLength(4);
    expect(await totales()).toEqual({ reservas: 1, lineas: 2 });
  });
});
