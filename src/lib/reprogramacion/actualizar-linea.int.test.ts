import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { HorarioOcupado } from "@/lib/reserva/vencimiento";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, crearReserva, crearServicio, hora } from "../../../tests/support/fixtures";
import { actualizarLineaLiberandoVencidas, type ResultadoActualizacion } from "./actualizar-linea";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const AHORA = new Date("2026-03-02T12:00:00Z");
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);

async function mundo() {
  const m = await crearMaquilladora(db, { nombre: "Ana" });
  const otra = await crearMaquilladora(db, { nombre: "Bea" });
  const s = await crearServicio(db);
  const mia = await crearReserva(db, { estado: "confirmada", numeroOperacion: "OP-MIA", creadaEn: hace(600) });
  const linea = await crearLinea(db, {
    reservaId: mia.id,
    maquilladoraId: m.id,
    servicioId: s.id,
    inicio: hora("10:00"),
    fin: hora("11:00"),
  });
  return { m, otra, s, mia, linea };
}

type Mundo = Awaited<ReturnType<typeof mundo>>;
type Destino = { maquilladoraId: number; inicio: Date; fin: Date };

/** Mueve la línea con la misma semántica que `reprogramarTurno`: si queda ocupado, se deshace todo. */
async function mover(
  w: Mundo,
  destino: Destino,
  visto: { inicio: Date; maquilladoraId: number } = { inicio: hora("10:00"), maquilladoraId: w.m.id },
): Promise<ResultadoActualizacion> {
  try {
    return await db.transaction(async (tx) => {
      const r = await actualizarLineaLiberandoVencidas(
        tx,
        { lineaId: w.linea.id, inicioVisto: visto.inicio, maquilladoraVistaId: visto.maquilladoraId, destino },
        AHORA,
      );
      if (r === "ocupado") throw new HorarioOcupado();
      return r;
    });
  } catch (error) {
    if (error instanceof HorarioOcupado) return "ocupado";
    throw error;
  }
}

const lineaDe = async (id: number) => (await db.select().from(reservaLinea).where(eq(reservaLinea.id, id)))[0];
const reservaDe = async (id: number) => (await db.select().from(reserva).where(eq(reserva.id, id)))[0];

async function ocupar(w: Mundo, maquilladoraId: number, desde: string, hasta: string, minutosDeAntiguedad: number) {
  const r = await crearReserva(db, { creadaEn: hace(minutosDeAntiguedad) });
  await crearLinea(db, { reservaId: r.id, maquilladoraId, servicioId: w.s.id, inicio: hora(desde), fin: hora(hasta) });
  return r;
}

describe("actualizarLineaLiberandoVencidas", () => {
  it("con el destino libre mueve el turno, incluso a otra maquilladora", async () => {
    const w = await mundo();

    expect(await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") })).toBe("actualizada");

    expect(await lineaDe(w.linea.id)).toMatchObject({
      maquilladoraId: w.otra.id,
      inicio: hora("12:00"),
      fin: hora("13:00"),
      activa: true,
    });
  });

  it("puede desplazarse sobre su propio horario (10:30, cruzado con 10:00-11:00)", async () => {
    const w = await mundo();
    expect(await mover(w, { maquilladoraId: w.m.id, inicio: hora("10:30"), fin: hora("11:30") })).toBe("actualizada");
    expect((await lineaDe(w.linea.id)).inicio).toEqual(hora("10:30"));
  });

  it("si el destino lo ocupa una vencida, la cancela (motivo vencida) y mueve", async () => {
    const w = await mundo();
    const v = await ocupar(w, w.otra.id, "12:00", "13:00", 30);

    expect(await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") })).toBe("actualizada");

    expect(await reservaDe(v.id)).toMatchObject({ estado: "cancelada", motivoCancelacion: "vencida" });
    expect((await db.select().from(reservaLinea).where(eq(reservaLinea.reservaId, v.id))).every((l) => !l.activa)).toBe(true);
    expect((await lineaDe(w.linea.id)).maquilladoraId).toBe(w.otra.id);
  });

  it("si lo ocupa una vencida y una vigente, devuelve ocupado y el turno y la vencida quedan como estaban", async () => {
    const w = await mundo();
    const v = await ocupar(w, w.otra.id, "12:00", "13:00", 30);
    await ocupar(w, w.otra.id, "13:00", "14:00", 1);

    // El destino 12:30-13:30 toca a la vencida y a la vigente.
    expect(await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:30"), fin: hora("13:30") })).toBe("ocupado");

    expect(await lineaDe(w.linea.id)).toMatchObject({ maquilladoraId: w.m.id, inicio: hora("10:00") });
    expect((await reservaDe(v.id)).estado).toBe("pendiente_pago");
  });

  it("solo una vigente en el destino: ocupado sin cancelar nada", async () => {
    const w = await mundo();
    await ocupar(w, w.otra.id, "12:00", "13:00", 1);
    expect(await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") })).toBe("ocupado");
    expect((await lineaDe(w.linea.id)).inicio).toEqual(hora("10:00"));
  });

  it("se cruza con su propio horario y con una vencida: libera la vencida y completa", async () => {
    const w = await mundo();
    const v = await ocupar(w, w.m.id, "11:00", "12:00", 30);

    expect(await mover(w, { maquilladoraId: w.m.id, inicio: hora("10:30"), fin: hora("11:30") })).toBe("actualizada");

    expect((await reservaDe(v.id)).estado).toBe("cancelada");
    expect((await lineaDe(w.linea.id)).inicio).toEqual(hora("10:30"));
  });

  it("repetir el mismo cambio (doble clic) responde repetida sin cambiar nada", async () => {
    const w = await mundo();
    const destino = { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") };
    await mover(w, destino);

    expect(await mover(w, destino)).toBe("repetida");
    expect(await lineaDe(w.linea.id)).toMatchObject({ maquilladoraId: w.otra.id, inicio: hora("12:00") });
  });

  it("una pantalla desactualizada responde turno_cambiado", async () => {
    const w = await mundo();
    await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") });

    expect(await mover(w, { maquilladoraId: w.m.id, inicio: hora("09:00"), fin: hora("10:00") })).toBe("turno_cambiado");
    expect((await lineaDe(w.linea.id)).inicio).toEqual(hora("12:00"));
  });

  it("una línea inactiva no se mueve", async () => {
    const w = await mundo();
    await db.update(reservaLinea).set({ activa: false }).where(eq(reservaLinea.id, w.linea.id));
    expect(await mover(w, { maquilladoraId: w.otra.id, inicio: hora("12:00"), fin: hora("13:00") })).toBe("turno_cambiado");
  });
});
