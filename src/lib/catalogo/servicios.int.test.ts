import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservaLinea, servicio } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearServicio as crearServicioFixture, hora } from "../../../tests/support/fixtures";
import {
  actualizarServicio,
  cambiarActivoServicio,
  crearServicio,
  listarServicios,
  obtenerServicio,
} from "./servicios";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const datos = { nombre: "Maquillaje social", descripcion: "Para eventos", precio: "350.50", duracionMinutos: 60 };

describe("crearServicio", () => {
  it("guarda el servicio activo, con el precio exacto", async () => {
    const creado = await crearServicio(db, datos);
    expect(creado).toMatchObject({ ...datos, activo: true });
    expect((await obtenerServicio(db, creado.id))?.precio).toBe("350.50");
  });

  it("permite nombres repetidos", async () => {
    await crearServicio(db, datos);
    await crearServicio(db, datos);
    expect(await listarServicios(db)).toHaveLength(2);
  });
});

describe("actualizarServicio", () => {
  it("modifica los datos y deja el estado como estaba", async () => {
    const creado = await crearServicio(db, datos);
    await cambiarActivoServicio(db, creado.id, false);

    const editado = await actualizarServicio(db, creado.id, {
      nombre: "Peinado",
      descripcion: "",
      precio: "80.00",
      duracionMinutos: 45,
    });

    expect(editado).toMatchObject({ id: creado.id, nombre: "Peinado", precio: "80.00", duracionMinutos: 45, activo: false });
  });

  it("devuelve undefined si el servicio no existe y no crea nada", async () => {
    expect(await actualizarServicio(db, 999, datos)).toBeUndefined();
    expect(await listarServicios(db)).toHaveLength(0);
  });

  it("no cambia el precio de las líneas de reserva ya creadas", async () => {
    const s = await crearServicioFixture(db, { precio: "120.00" });
    const linea = await crearLinea(db, { servicioId: s.id, precio: "120.00", inicio: hora("10:00"), fin: hora("11:00") });

    await actualizarServicio(db, s.id, { nombre: s.nombre, descripcion: "", precio: "999.00", duracionMinutos: 60 });

    expect((await obtenerServicio(db, s.id))?.precio).toBe("999.00");
    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada.precio).toBe("120.00");
  });
});

describe("cambiarActivoServicio", () => {
  it("desactiva y reactiva sin borrar", async () => {
    const { id } = await crearServicio(db, datos);

    expect((await cambiarActivoServicio(db, id, false))?.activo).toBe(false);
    expect(await listarServicios(db)).toHaveLength(1);
    expect((await cambiarActivoServicio(db, id, true))?.activo).toBe(true);
  });

  it("es idempotente: repetir el estado destino no falla ni cambia nada más", async () => {
    const { id } = await crearServicio(db, datos);
    await cambiarActivoServicio(db, id, false);
    expect((await cambiarActivoServicio(db, id, false))?.activo).toBe(false);
  });

  it("no toca las líneas de reserva del servicio", async () => {
    const s = await crearServicioFixture(db);
    const linea = await crearLinea(db, { servicioId: s.id, inicio: hora("10:00"), fin: hora("11:00") });

    await cambiarActivoServicio(db, s.id, false);

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada.activa).toBe(true);
  });

  it("devuelve undefined si el servicio no existe", async () => {
    expect(await cambiarActivoServicio(db, 999, false)).toBeUndefined();
  });
});

describe("listarServicios", () => {
  it("devuelve activos e inactivos, con los activos primero y por nombre", async () => {
    const b = await crearServicio(db, { ...datos, nombre: "B" });
    await crearServicio(db, { ...datos, nombre: "C" });
    await crearServicio(db, { ...datos, nombre: "A" });
    await cambiarActivoServicio(db, b.id, false);

    expect((await listarServicios(db)).map((s) => [s.nombre, s.activo])).toEqual([
      ["A", true],
      ["C", true],
      ["B", false],
    ]);
  });

  it("devuelve una lista vacía sin servicios", async () => {
    expect(await listarServicios(db)).toEqual([]);
  });
});

describe("integridad que la base sigue haciendo cumplir", () => {
  it("rechaza borrar un servicio con líneas de reserva", async () => {
    const s = await crearServicioFixture(db);
    await crearLinea(db, { servicioId: s.id, inicio: hora("10:00"), fin: hora("11:00") });

    await expect(db.delete(servicio).where(eq(servicio.id, s.id))).rejects.toThrow();
    expect(await obtenerServicio(db, s.id)).toBeDefined();
  });
});
