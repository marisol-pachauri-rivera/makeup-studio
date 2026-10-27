import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearMaquilladora, crearServicio } from "../../../tests/support/fixtures";
import {
  listarMaquilladorasActivas,
  listarServiciosActivos,
  obtenerMaquilladoraActiva,
  obtenerServicioActivo,
} from "./catalogo";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

describe("servicios", () => {
  it("lista solo los activos, por nombre", async () => {
    await crearServicio(db, { nombre: "Peinado" });
    await crearServicio(db, { nombre: "Novia", activo: false });
    await crearServicio(db, { nombre: "Maquillaje social" });

    expect((await listarServiciosActivos(db)).map((s) => s.nombre)).toEqual(["Maquillaje social", "Peinado"]);
  });

  it("devuelve el precio exacto como texto", async () => {
    await crearServicio(db, { precio: "350.50" });
    const [servicio] = await listarServiciosActivos(db);
    expect(servicio.precio).toBe("350.50");
    expect(typeof servicio.precio).toBe("string");
  });

  it("devuelve una lista vacía si no hay activos", async () => {
    await crearServicio(db, { activo: false });
    expect(await listarServiciosActivos(db)).toEqual([]);
  });

  it("obtiene un servicio activo por id", async () => {
    const s = await crearServicio(db, { nombre: "Peinado" });
    expect((await obtenerServicioActivo(db, s.id))?.nombre).toBe("Peinado");
  });

  it("no obtiene uno inactivo ni uno inexistente", async () => {
    const inactivo = await crearServicio(db, { activo: false });
    expect(await obtenerServicioActivo(db, inactivo.id)).toBeUndefined();
    expect(await obtenerServicioActivo(db, 9999)).toBeUndefined();
  });
});

describe("maquilladoras", () => {
  it("lista solo las activas, por nombre", async () => {
    await crearMaquilladora(db, { nombre: "Lucía" });
    await crearMaquilladora(db, { nombre: "Bea", activa: false });
    await crearMaquilladora(db, { nombre: "Ana" });

    expect((await listarMaquilladorasActivas(db)).map((m) => m.nombre)).toEqual(["Ana", "Lucía"]);
  });

  it("devuelve una lista vacía si no hay activas", async () => {
    await crearMaquilladora(db, { activa: false });
    expect(await listarMaquilladorasActivas(db)).toEqual([]);
  });

  it("obtiene una activa por id", async () => {
    const m = await crearMaquilladora(db, { nombre: "Ana" });
    expect((await obtenerMaquilladoraActiva(db, m.id))?.nombre).toBe("Ana");
  });

  it("no obtiene una inactiva ni una inexistente", async () => {
    const inactiva = await crearMaquilladora(db, { activa: false });
    expect(await obtenerMaquilladoraActiva(db, inactiva.id)).toBeUndefined();
    expect(await obtenerMaquilladoraActiva(db, 9999)).toBeUndefined();
  });
});
