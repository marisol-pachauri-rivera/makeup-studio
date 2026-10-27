import { sql } from "drizzle-orm";
import { afterAll, afterEach, expect, it } from "vitest";
import { reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../support/db";
import { crearMaquilladora, crearReserva, crearServicio, hora } from "../support/fixtures";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

// Estas transacciones confirman de verdad, así que el estado se limpia a mano.
afterEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora, usuario_admin restart identity cascade`,
  );
});

const REPETICIONES = 20;

it(`dos transacciones simultáneas por el mismo horario: una gana y la otra falla (x${REPETICIONES})`, async () => {
  for (let i = 0; i < REPETICIONES; i++) {
    const m = await crearMaquilladora(db);
    const s = await crearServicio(db);
    const [a, b] = [await crearReserva(db), await crearReserva(db)];

    const intentar = (reservaId: number) =>
      db.transaction(async (tx) => {
        await tx.insert(reservaLinea).values({
          reservaId,
          servicioId: s.id,
          maquilladoraId: m.id,
          persona: "Lucía",
          inicio: hora("10:00"),
          fin: hora("11:00"),
          precio: "120.00",
        });
        // Mantiene la transacción abierta un instante para que ambas se pisen de verdad.
        await tx.execute(sql`select pg_sleep(0.05)`);
      });

    const resultados = await Promise.allSettled([intentar(a.id), intentar(b.id)]);

    const exitos = resultados.filter((r) => r.status === "fulfilled");
    const fallos = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(exitos, `iteración ${i}`).toHaveLength(1);
    expect(fallos, `iteración ${i}`).toHaveLength(1);
    // La perdedora recibe 23P01 (exclusión) o 40P01 (deadlock detectado: ambas se esperaron entre sí).
    expect(["23P01", "40P01"]).toContain((fallos[0].reason as { cause?: { code?: string } }).cause?.code);

    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from reserva_linea`);
    expect(rows[0].n).toBe("1");

    await db.execute(
      sql`truncate table reserva_linea, reserva, servicio, maquilladora restart identity cascade`,
    );
  }
}, 60_000);
