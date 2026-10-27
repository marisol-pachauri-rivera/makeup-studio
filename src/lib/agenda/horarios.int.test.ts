import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { horarioTrabajo, reservaLinea } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { crearLinea, crearMaquilladora, hora } from "../../../tests/support/fixtures";
import { agregarHorario, listarHorarios, quitarHorario } from "./horarios";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(
    sql`truncate table reserva_linea, reserva, bloqueo_agenda, horario_trabajo, servicio, maquilladora restart identity cascade`,
  );
});

const tramo = (diaSemana: number, horaInicio: string, horaFin: string) => ({ diaSemana, horaInicio, horaFin });

describe("agregarHorario", () => {
  it("guarda un tramo válido", async () => {
    const m = await crearMaquilladora(db);
    const r = await agregarHorario(db, m.id, tramo(1, "09:00", "18:00"));

    expect(r.estado).toBe("creado");
    expect((await listarHorarios(db, m.id)).map((h) => [h.diaSemana, h.horaInicio, h.horaFin])).toEqual([
      [1, "09:00:00", "18:00:00"],
    ]);
  });

  it("permite dos tramos el mismo día que no se solapan", async () => {
    const m = await crearMaquilladora(db);
    expect((await agregarHorario(db, m.id, tramo(2, "09:00", "13:00"))).estado).toBe("creado");
    expect((await agregarHorario(db, m.id, tramo(2, "15:00", "19:00"))).estado).toBe("creado");
    expect(await listarHorarios(db, m.id)).toHaveLength(2);
  });

  it.each([
    ["se cruza por el final", "12:00", "16:00"],
    ["se cruza por el inicio", "07:00", "10:00"],
    ["está dentro de otro", "10:00", "11:00"],
    ["contiene a otro", "08:00", "14:00"],
    ["es idéntico", "09:00", "13:00"],
  ])("rechaza un tramo que %s", async (_caso, inicio, fin) => {
    const m = await crearMaquilladora(db);
    await agregarHorario(db, m.id, tramo(2, "09:00", "13:00"));

    expect((await agregarHorario(db, m.id, tramo(2, inicio, fin))).estado).toBe("solapado");
    expect(await listarHorarios(db, m.id)).toHaveLength(1);
  });

  it("acepta tramos contiguos (el fin de uno es el inicio del otro)", async () => {
    const m = await crearMaquilladora(db);
    await agregarHorario(db, m.id, tramo(2, "09:00", "13:00"));

    expect((await agregarHorario(db, m.id, tramo(2, "13:00", "17:00"))).estado).toBe("creado");
    expect((await agregarHorario(db, m.id, tramo(2, "07:00", "09:00"))).estado).toBe("creado");
  });

  it("acepta el mismo tramo en otro día", async () => {
    const m = await crearMaquilladora(db);
    await agregarHorario(db, m.id, tramo(2, "09:00", "13:00"));
    expect((await agregarHorario(db, m.id, tramo(3, "09:00", "13:00"))).estado).toBe("creado");
  });

  it("acepta el mismo tramo en otra maquilladora", async () => {
    const a = await crearMaquilladora(db, { nombre: "Ana" });
    const b = await crearMaquilladora(db, { nombre: "Bea" });
    await agregarHorario(db, a.id, tramo(2, "09:00", "13:00"));
    expect((await agregarHorario(db, b.id, tramo(2, "09:00", "13:00"))).estado).toBe("creado");
  });

  it("informa si la maquilladora no existe", async () => {
    expect((await agregarHorario(db, 999, tramo(1, "09:00", "18:00"))).estado).toBe("maquilladora_inexistente");
  });

  it("deja pasar solo una de dos altas simultáneas que se solapan", async () => {
    const m = await crearMaquilladora(db);
    const resultados = await Promise.all([
      agregarHorario(db, m.id, tramo(4, "09:00", "13:00")),
      agregarHorario(db, m.id, tramo(4, "11:00", "15:00")),
    ]);

    expect(resultados.map((r) => r.estado).sort()).toEqual(["creado", "solapado"]);
    expect(await listarHorarios(db, m.id)).toHaveLength(1);
  });

  it("no modifica las líneas de reserva de la maquilladora", async () => {
    const m = await crearMaquilladora(db);
    const linea = await crearLinea(db, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });

    await agregarHorario(db, m.id, tramo(1, "09:00", "18:00"));

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada).toMatchObject({ activa: true, inicio: linea.inicio, fin: linea.fin });
  });
});

describe("listarHorarios", () => {
  it("ordena por día y por hora de inicio, y solo trae los de la maquilladora", async () => {
    const m = await crearMaquilladora(db, { nombre: "Ana" });
    const otra = await crearMaquilladora(db, { nombre: "Bea" });
    await agregarHorario(db, m.id, tramo(3, "15:00", "19:00"));
    await agregarHorario(db, m.id, tramo(1, "09:00", "13:00"));
    await agregarHorario(db, m.id, tramo(3, "09:00", "13:00"));
    await agregarHorario(db, otra.id, tramo(0, "09:00", "13:00"));

    expect((await listarHorarios(db, m.id)).map((h) => [h.diaSemana, h.horaInicio])).toEqual([
      [1, "09:00:00"],
      [3, "09:00:00"],
      [3, "15:00:00"],
    ]);
  });

  it("devuelve una lista vacía sin tramos", async () => {
    const m = await crearMaquilladora(db);
    expect(await listarHorarios(db, m.id)).toEqual([]);
  });
});

describe("quitarHorario", () => {
  it("borra el tramo y deja los demás", async () => {
    const m = await crearMaquilladora(db);
    const r = await agregarHorario(db, m.id, tramo(1, "09:00", "13:00"));
    await agregarHorario(db, m.id, tramo(1, "15:00", "19:00"));
    if (r.estado !== "creado") throw new Error("alta esperada");

    expect(await quitarHorario(db, m.id, r.horario.id)).toBe(true);
    expect((await listarHorarios(db, m.id)).map((h) => h.horaInicio)).toEqual(["15:00:00"]);
  });

  it("no falla si el tramo ya no existe", async () => {
    const m = await crearMaquilladora(db);
    expect(await quitarHorario(db, m.id, 999)).toBe(false);
  });

  it("repetir la baja no falla", async () => {
    const m = await crearMaquilladora(db);
    const r = await agregarHorario(db, m.id, tramo(1, "09:00", "13:00"));
    if (r.estado !== "creado") throw new Error("alta esperada");

    expect(await quitarHorario(db, m.id, r.horario.id)).toBe(true);
    expect(await quitarHorario(db, m.id, r.horario.id)).toBe(false);
  });

  it("no borra un tramo que pertenece a otra maquilladora", async () => {
    const a = await crearMaquilladora(db, { nombre: "Ana" });
    const b = await crearMaquilladora(db, { nombre: "Bea" });
    const r = await agregarHorario(db, a.id, tramo(1, "09:00", "13:00"));
    if (r.estado !== "creado") throw new Error("alta esperada");

    expect(await quitarHorario(db, b.id, r.horario.id)).toBe(false);
    expect(await db.select().from(horarioTrabajo).where(eq(horarioTrabajo.id, r.horario.id))).toHaveLength(1);
  });

  it("no modifica las líneas de reserva", async () => {
    const m = await crearMaquilladora(db);
    const linea = await crearLinea(db, { maquilladoraId: m.id, inicio: hora("10:00"), fin: hora("11:00") });
    const r = await agregarHorario(db, m.id, tramo(1, "09:00", "13:00"));
    if (r.estado !== "creado") throw new Error("alta esperada");

    await quitarHorario(db, m.id, r.horario.id);

    const [guardada] = await db.select().from(reservaLinea).where(eq(reservaLinea.id, linea.id));
    expect(guardada.activa).toBe(true);
  });
});
