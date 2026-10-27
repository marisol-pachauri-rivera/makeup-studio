import { afterAll, expect, it } from "vitest";
import { crearDbDePrueba, enTransaccionRevertida } from "../support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../support/fixtures";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

it("cada fixture inserta y devuelve la fila creada", () =>
  enTransaccionRevertida(db, async (tx) => {
    expect(await crearMaquilladora(tx)).toMatchObject({ nombre: "Ana", activa: true });
    expect(await crearServicio(tx)).toMatchObject({ precio: "120.00", duracionMinutos: 60 });
    expect(await crearReserva(tx)).toMatchObject({ estado: "pendiente_pago", numeroOperacion: null });
    expect(await crearLinea(tx, { inicio: hora("10:00"), fin: hora("11:00") })).toMatchObject({
      activa: true,
      persona: "Lucía",
    });
  }));

it("los valores por defecto se pueden reemplazar", () =>
  enTransaccionRevertida(db, async (tx) => {
    const m = await crearMaquilladora(tx, { nombre: "Bea", activa: false });
    expect(m).toMatchObject({ nombre: "Bea", activa: false });
  }));
