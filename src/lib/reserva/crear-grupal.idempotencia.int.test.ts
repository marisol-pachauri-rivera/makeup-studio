import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserva, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { MADRUGADA, mundoGrupal, solicitudGrupal, trioBase, type MundoGrupal } from "../../../tests/support/grupo";
import { crearReservaGrupal } from "./crear-grupal";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

let w: MundoGrupal;
beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
  w = await mundoGrupal(db);
});

const totales = async () => ({
  reservas: (await db.select().from(reserva)).length,
  lineas: (await db.select().from(reservaLinea)).length,
});

describe("idempotencia del grupo", () => {
  it("reenviar la misma clave devuelve el mismo grupo sin crear otro", async () => {
    const s = solicitudGrupal(trioBase(w));

    const primera = await crearReservaGrupal(db, s, MADRUGADA);
    const segunda = await crearReservaGrupal(db, s, MADRUGADA);

    expect(primera).toMatchObject({ estado: "creada", repetida: false });
    expect(segunda).toMatchObject({ estado: "creada", repetida: true });
    if (primera.estado !== "creada" || segunda.estado !== "creada") throw new Error("grupo esperado");
    expect(segunda.token).toBe(primera.token);
    expect(await totales()).toEqual({ reservas: 1, lineas: 3 });
  });

  it("el reenvío funciona aunque los horarios ya no se ofrezcan porque son suyos", async () => {
    const s = solicitudGrupal(trioBase(w));
    await crearReservaGrupal(db, s, MADRUGADA);
    // Una consulta de disponibilidad ya no los ofrecería: están ocupados por este mismo grupo.
    expect((await crearReservaGrupal(db, s, MADRUGADA)).estado).toBe("creada");
  });

  it("el reenvío funciona incluso si los horarios ya pasaron", async () => {
    const s = solicitudGrupal(trioBase(w));
    const primera = await crearReservaGrupal(db, s, MADRUGADA);
    const tarde = await crearReservaGrupal(db, s, new Date("2026-12-21T22:00:00Z"));
    if (primera.estado !== "creada" || tarde.estado !== "creada") throw new Error("grupo esperado");
    expect(tarde).toMatchObject({ repetida: true, token: primera.token });
  });

  it("dos envíos simultáneos con la misma clave crean un solo grupo y ninguno informa un choque", async () => {
    for (let ronda = 0; ronda < 5; ronda++) {
      await db.execute(sql`truncate table reserva_linea, reserva restart identity cascade`);
      const s = solicitudGrupal(trioBase(w));

      const [a, b] = await Promise.all([crearReservaGrupal(db, s, MADRUGADA), crearReservaGrupal(db, s, MADRUGADA)]);

      expect(a.estado).toBe("creada");
      expect(b.estado).toBe("creada");
      if (a.estado !== "creada" || b.estado !== "creada") throw new Error("grupo esperado");
      expect(a.token).toBe(b.token);
      expect(await totales()).toEqual({ reservas: 1, lineas: 3 });
    }
  });

  it("claves distintas por los mismos horarios son clientas distintas: solo un grupo se crea", async () => {
    expect((await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA)).estado).toBe("creada");
    expect((await crearReservaGrupal(db, solicitudGrupal(trioBase(w)), MADRUGADA)).estado).toBe("rechazada");
    expect(await totales()).toEqual({ reservas: 1, lineas: 3 });
  });

  it("la misma clave con otro contenido devuelve el grupo ya creado (por eso el cliente cambia la clave)", async () => {
    const s = solicitudGrupal(trioBase(w));
    const primera = await crearReservaGrupal(db, s, MADRUGADA);
    const otro = await crearReservaGrupal(db, { ...s, personas: s.personas.slice(0, 2) }, MADRUGADA);
    if (primera.estado !== "creada" || otro.estado !== "creada") throw new Error("grupo esperado");
    expect(otro.token).toBe(primera.token);
    expect(await totales()).toEqual({ reservas: 1, lineas: 3 });
  });
});
