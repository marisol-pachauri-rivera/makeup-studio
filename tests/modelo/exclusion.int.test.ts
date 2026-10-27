import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { crearDbDePrueba, enTransaccionRevertida, type Tx } from "../support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../support/fixtures";
import { esperarRechazo } from "../support/rechazo";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

const EXCLUSION = "23P01";
const RESTRICCION = "reserva_linea_sin_solapamiento";

/** Prepara una maquilladora y un servicio, y devuelve una función para crear líneas en ella. */
async function agenda(tx: Tx) {
  const m = await crearMaquilladora(tx);
  const s = await crearServicio(tx);
  const linea = (inicio: string, fin: string, extra: Partial<typeof reservaLinea.$inferInsert> = {}) =>
    crearLinea(tx, { maquilladoraId: m.id, servicioId: s.id, inicio: hora(inicio), fin: hora(fin), ...extra });
  return { m, s, linea };
}

describe("no solapamiento por maquilladora", () => {
  it("rechaza un solapamiento parcial", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00");

      const rechazo = await esperarRechazo(tx, () => linea("10:30", "11:30"));

      expect(rechazo).toEqual({ codigo: EXCLUSION, restriccion: RESTRICCION });
    }));

  it("rechaza una línea que contiene por completo a otra", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00");

      const rechazo = await esperarRechazo(tx, () => linea("09:00", "12:00"));

      expect(rechazo.codigo).toBe(EXCLUSION);
    }));

  it("rechaza una línea idéntica", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00");
      expect((await esperarRechazo(tx, () => linea("10:00", "11:00"))).codigo).toBe(EXCLUSION);
    }));

  it("acepta turnos contiguos", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00");
      await linea("11:00", "12:00");
      await linea("09:00", "10:00");
    }));

  it("acepta el mismo horario con otra maquilladora", () =>
    enTransaccionRevertida(db, async (tx) => {
      const a = await agenda(tx);
      const b = await crearMaquilladora(tx, { nombre: "Bea" });
      await a.linea("10:00", "11:00");

      await crearLinea(tx, { maquilladoraId: b.id, servicioId: a.s.id, inicio: hora("10:00"), fin: hora("11:00") });
    }));
});

describe("líneas inactivas", () => {
  it("una línea inactiva no bloquea el horario", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00", { activa: false });
      await linea("10:30", "11:30");
    }));

  it("una línea inactiva no es bloqueada por una activa", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      await linea("10:00", "11:00");
      await linea("10:30", "11:30", { activa: false });
    }));

  it("desactivar una línea libera el horario", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      const primera = await linea("10:00", "11:00");
      await tx.update(reservaLinea).set({ activa: false }).where(eq(reservaLinea.id, primera.id));

      await linea("10:00", "11:00");
    }));

  it("rechaza reactivar una línea cuyo horario ya está ocupado", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      const inactiva = await linea("10:00", "11:00", { activa: false });
      await linea("10:00", "11:00");

      const rechazo = await esperarRechazo(tx, (sp) =>
        sp.update(reservaLinea).set({ activa: true }).where(eq(reservaLinea.id, inactiva.id)),
      );

      expect(rechazo).toEqual({ codigo: EXCLUSION, restriccion: RESTRICCION });
    }));
});

describe("reprogramación", () => {
  it("acepta mover una línea a un rango que solo se solapa con su propio rango anterior", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      const l = await linea("10:00", "11:00");

      const [movida] = await tx
        .update(reservaLinea)
        .set({ inicio: hora("10:30"), fin: hora("11:30") })
        .where(eq(reservaLinea.id, l.id))
        .returning();

      expect(movida.inicio).toEqual(hora("10:30"));
    }));

  it("rechaza mover una línea a un horario ocupado y conserva el anterior", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { linea } = await agenda(tx);
      const l = await linea("10:00", "11:00");
      await linea("12:00", "13:00");

      const rechazo = await esperarRechazo(tx, (sp) =>
        sp.update(reservaLinea).set({ inicio: hora("12:30"), fin: hora("13:30") }).where(eq(reservaLinea.id, l.id)),
      );

      expect(rechazo.codigo).toBe(EXCLUSION);
      const [despues] = await tx.select().from(reservaLinea).where(eq(reservaLinea.id, l.id));
      expect(despues.inicio).toEqual(hora("10:00"));
    }));
});

describe("reservas de varias líneas", () => {
  it("una transacción que choca en la segunda línea no deja ninguna de las dos", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { m, s, linea } = await agenda(tx);
      await linea("12:00", "13:00");
      const grupo = await crearReserva(tx, { nombreContacto: "Elenco" });

      const rechazo = await esperarRechazo(tx, async (sp) => {
        await crearLinea(sp, { reservaId: grupo.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora("10:00"), fin: hora("11:00") });
        await crearLinea(sp, { reservaId: grupo.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora("12:30"), fin: hora("13:30") });
      });

      expect(rechazo.codigo).toBe(EXCLUSION);
      expect(await tx.select().from(reservaLinea).where(eq(reservaLinea.reservaId, grupo.id))).toHaveLength(0);
    }));
});

describe("el vencimiento no libera horario por sí solo", () => {
  it("una reserva sin pagar con más de 20 minutos sigue bloqueando", () =>
    enTransaccionRevertida(db, async (tx) => {
      const { m, s, linea } = await agenda(tx);
      const hace30Min = new Date(Date.now() - 30 * 60_000);
      const vieja = await crearReserva(tx, { creadaEn: hace30Min });
      await linea("10:00", "11:00", { reservaId: vieja.id });

      const [r] = await tx.select().from(reserva).where(eq(reserva.id, vieja.id));
      expect(r.estado).toBe("pendiente_pago");
      const rechazo = await esperarRechazo(tx, (sp) =>
        crearLinea(sp, { maquilladoraId: m.id, servicioId: s.id, inicio: hora("10:30"), fin: hora("11:30") }),
      );

      expect(rechazo).toEqual({ codigo: EXCLUSION, restriccion: RESTRICCION });
    }));
});
