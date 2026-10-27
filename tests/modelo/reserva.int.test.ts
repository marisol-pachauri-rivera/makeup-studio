import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { maquilladora, reserva, reservaLinea, servicio } from "@/db/schema";
import { crearDbDePrueba, enTransaccionRevertida } from "../support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../support/fixtures";
import { esperarRechazo } from "../support/rechazo";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

const CHECK = "23514";
const UNIQUE = "23505";
const FK = "23503";

describe("reserva: valores por defecto y dominios", () => {
  it("nace pendiente de pago, sin número, sin reembolso y con fecha de creación", () =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await crearReserva(tx);
      expect(r).toMatchObject({
        estado: "pendiente_pago",
        estadoReembolso: "no_aplica",
        numeroOperacion: null,
        motivoCancelacion: null,
        motivoRechazo: null,
        validadaEn: null,
      });
      expect(r.creadaEn).toBeInstanceOf(Date);
    }));

  it("rechaza un estado fuera de los cuatro permitidos", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { estado: "otro" as never }));
      // Un estado inválido también incumple la coherencia con el número; Postgres informa una de las dos.
      expect(rechazo.codigo).toBe(CHECK);
      expect(["reserva_estado_valido", "reserva_estado_numero_coherente"]).toContain(rechazo.restriccion);
    }));

  it("rechaza un estado de reembolso inválido", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { estadoReembolso: "otro" as never }));
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_reembolso_valido" });
    }));

  it("rechaza un monto total negativo", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { montoTotal: "-1" }));
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_monto_no_negativo" });
    }));
});

describe("reserva: token de acceso", () => {
  it("genera un token distinto para cada reserva", () =>
    enTransaccionRevertida(db, async (tx) => {
      const a = await crearReserva(tx);
      const b = await crearReserva(tx);
      expect(a.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(a.token).not.toBe(b.token);
    }));

  it("rechaza un token ya usado por otra reserva", () =>
    enTransaccionRevertida(db, async (tx) => {
      const a = await crearReserva(tx);
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { token: a.token }));
      expect(rechazo).toEqual({ codigo: UNIQUE, restriccion: "reserva_token_unico" });
    }));
});

describe("reserva: clave de idempotencia", () => {
  const CLAVE = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

  it("nace sin clave", () =>
    enTransaccionRevertida(db, async (tx) => {
      expect((await crearReserva(tx)).claveIdempotencia).toBeNull();
    }));

  it("guarda la clave de la reserva", () =>
    enTransaccionRevertida(db, async (tx) => {
      expect((await crearReserva(tx, { claveIdempotencia: CLAVE })).claveIdempotencia).toBe(CLAVE);
    }));

  it("rechaza una clave ya usada por otra reserva", () =>
    enTransaccionRevertida(db, async (tx) => {
      await crearReserva(tx, { claveIdempotencia: CLAVE });
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { claveIdempotencia: CLAVE }));
      expect(rechazo).toEqual({ codigo: UNIQUE, restriccion: "reserva_clave_idempotencia_unica" });
    }));

  it("permite varias reservas sin clave", () =>
    enTransaccionRevertida(db, async (tx) => {
      await crearReserva(tx);
      await crearReserva(tx);
      await crearReserva(tx);
    }));
});

describe("reserva: número de operación único", () => {
  const aValidacion = (numero: string) => ({ estado: "pendiente_validacion" as const, numeroOperacion: numero });

  it("rechaza un número ya usado y la reserva conserva su estado", () =>
    enTransaccionRevertida(db, async (tx) => {
      await crearReserva(tx, aValidacion("OP-1"));
      const b = await crearReserva(tx);

      const rechazo = await esperarRechazo(tx, (sp) =>
        sp.update(reserva).set(aValidacion("OP-1")).where(eq(reserva.id, b.id)),
      );

      expect(rechazo).toEqual({ codigo: UNIQUE, restriccion: "reserva_numero_operacion_unico" });
      const [despues] = await tx.select().from(reserva).where(eq(reserva.id, b.id));
      expect(despues).toMatchObject({ estado: "pendiente_pago", numeroOperacion: null });
    }));

  it("permite varias reservas sin número", () =>
    enTransaccionRevertida(db, async (tx) => {
      await crearReserva(tx);
      await crearReserva(tx);
      await crearReserva(tx);
    }));

  it("acepta un número liberado por un rechazo de pago", () =>
    enTransaccionRevertida(db, async (tx) => {
      const a = await crearReserva(tx, aValidacion("OP-1"));
      await tx
        .update(reserva)
        .set({ estado: "pendiente_pago", numeroOperacion: null, motivoRechazo: "No coincide" })
        .where(eq(reserva.id, a.id));

      await crearReserva(tx, aValidacion("OP-1"));
    }));
});

describe("reserva: coherencia entre estado y número de operación", () => {
  it("rechaza pendiente de pago con número", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { numeroOperacion: "OP-1" }));
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_estado_numero_coherente" });
    }));

  it.each(["pendiente_validacion", "confirmada"] as const)("rechaza %s sin número", (estado) =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await crearReserva(tx);
      const rechazo = await esperarRechazo(tx, (sp) =>
        sp.update(reserva).set({ estado }).where(eq(reserva.id, r.id)),
      );
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_estado_numero_coherente" });
    }),
  );

  it("acepta cancelar una reserva confirmada conservando su número", () =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await crearReserva(tx, { estado: "confirmada", numeroOperacion: "OP-1" });
      const [c] = await tx
        .update(reserva)
        .set({ estado: "cancelada", motivoCancelacion: "clienta", estadoReembolso: "pendiente" })
        .where(eq(reserva.id, r.id))
        .returning();
      expect(c).toMatchObject({ estado: "cancelada", numeroOperacion: "OP-1" });
    }));

  it("acepta cancelar una reserva sin número", () =>
    enTransaccionRevertida(db, async (tx) => {
      await crearReserva(tx, { estado: "cancelada", motivoCancelacion: "vencida" });
    }));
});

describe("reserva: motivo de cancelación", () => {
  it("rechaza una reserva cancelada sin motivo", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) => crearReserva(sp, { estado: "cancelada" }));
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_cancelacion_coherente" });
    }));

  it("rechaza un motivo en una reserva que no está cancelada", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) =>
        crearReserva(sp, { estado: "confirmada", numeroOperacion: "OP-1", motivoCancelacion: "studio" }),
      );
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_cancelacion_coherente" });
    }));

  it("rechaza un motivo fuera de vencida, clienta o studio", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) =>
        crearReserva(sp, { estado: "cancelada", motivoCancelacion: "otro" as never }),
      );
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_motivo_cancelacion_valido" });
    }));
});

describe("reserva_linea", () => {
  it("guarda una línea válida, activa por defecto", () =>
    enTransaccionRevertida(db, async (tx) => {
      const linea = await crearLinea(tx, { inicio: hora("10:00"), fin: hora("11:00") });
      expect(linea.activa).toBe(true);
    }));

  it.each([
    ["fin igual al inicio", "10:00"],
    ["fin anterior al inicio", "09:00"],
  ])("rechaza un turno con %s", (_nombre, fin) =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) =>
        crearLinea(sp, { inicio: hora("10:00"), fin: hora(fin) }),
      );
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_linea_fin_posterior" });
    }),
  );

  it("rechaza un precio negativo", () =>
    enTransaccionRevertida(db, async (tx) => {
      const rechazo = await esperarRechazo(tx, (sp) =>
        crearLinea(sp, { inicio: hora("10:00"), fin: hora("11:00"), precio: "-1" }),
      );
      expect(rechazo).toEqual({ codigo: CHECK, restriccion: "reserva_linea_precio_no_negativo" });
    }));

  it("conserva el precio al cambiar el precio del servicio", () =>
    enTransaccionRevertida(db, async (tx) => {
      const s = await crearServicio(tx, { precio: "120.00" });
      const linea = await crearLinea(tx, {
        servicioId: s.id,
        precio: s.precio,
        inicio: hora("10:00"),
        fin: hora("11:00"),
      });

      await tx.update(servicio).set({ precio: "200.00" }).where(eq(servicio.id, s.id));

      const [despues] = await tx.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
      expect(despues.precio).toBe("120.00");
    }));

  it("asocia varias líneas a una reserva grupal", () =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await crearReserva(tx, { montoTotal: "360.00" });
      const m = await crearMaquilladora(tx);
      const s = await crearServicio(tx);
      const turnos = [
        ["10:00", "11:00"],
        ["11:00", "12:00"],
        ["12:00", "13:00"],
      ];
      for (const [i, f] of turnos) {
        await crearLinea(tx, { reservaId: r.id, maquilladoraId: m.id, servicioId: s.id, inicio: hora(i), fin: hora(f) });
      }

      const lineas = await tx.select().from(reservaLinea).where(eq(reservaLinea.reservaId, r.id));
      expect(lineas).toHaveLength(3);
    }));

  it("no deja borrar una maquilladora con líneas de reserva", () =>
    enTransaccionRevertida(db, async (tx) => {
      const m = await crearMaquilladora(tx);
      await crearLinea(tx, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });

      const rechazo = await esperarRechazo(tx, (sp) => sp.delete(maquilladora).where(eq(maquilladora.id, m.id)));

      expect(rechazo.codigo).toBe(FK);
    }));
});
