import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { intentoLogin } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import {
  borrarFallos,
  consultarLimite,
  MAX_INTENTOS_FALLIDOS,
  normalizarUsuario,
  registrarFallo,
  VENTANA_INTENTOS_MS,
} from "./limite-intentos";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(sql`truncate table intento_login restart identity`);
});

const T0 = new Date("2026-01-10T12:00:00Z");
const en = (ms: number) => new Date(T0.getTime() + ms);

async function fallar(usuario: string, veces: number, desde: Date = T0) {
  for (let i = 0; i < veces; i++) await registrarFallo(db, usuario, en(desde.getTime() - T0.getTime() + i * 1000));
}

describe("normalizarUsuario", () => {
  it("quita espacios en los extremos y pasa a minúsculas", () => {
    expect(normalizarUsuario("  María ")).toBe("maría");
  });
});

describe("límite de intentos", () => {
  it("con menos de 5 fallos no bloquea", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS - 1);
    expect(await consultarLimite(db, "maria", en(10_000))).toEqual({ bloqueado: false });
  });

  it("5 fallos bloquean y dicen cuándo se puede reintentar (el más antiguo + 15 min)", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS);
    expect(await consultarLimite(db, "maria", en(10_000))).toEqual({
      bloqueado: true,
      reintentarEn: en(VENTANA_INTENTOS_MS),
    });
  });

  it("un usuario inexistente se bloquea igual que uno real", async () => {
    await fallar("nadie-existe", MAX_INTENTOS_FALLIDOS);
    expect((await consultarLimite(db, "nadie-existe", en(10_000))).bloqueado).toBe(true);
  });

  it("el bloqueo es por usuario: otro usuario no se ve afectado", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS);
    expect((await consultarLimite(db, "lucia", en(10_000))).bloqueado).toBe(false);
  });

  it("consultar el límite no suma fallos ni extiende el bloqueo", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS);
    for (let i = 0; i < 3; i++) await consultarLimite(db, "maria", en(60_000 * (i + 1)));
    const filas = await db.select().from(intentoLogin).where(eq(intentoLogin.usuario, "maria"));
    expect(filas).toHaveLength(MAX_INTENTOS_FALLIDOS);
  });

  it("pasada la ventana desde el fallo más antiguo, vuelve a poder intentar", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS);
    expect((await consultarLimite(db, "maria", en(VENTANA_INTENTOS_MS - 1))).bloqueado).toBe(true);
    expect((await consultarLimite(db, "maria", en(VENTANA_INTENTOS_MS + 1))).bloqueado).toBe(false);
  });

  it("limpia de forma lazy los fallos vencidos del usuario, sin tocar los de otros", async () => {
    await fallar("maria", 2);
    await fallar("lucia", 2);
    await consultarLimite(db, "maria", en(VENTANA_INTENTOS_MS + 60_000));
    expect(await db.select().from(intentoLogin).where(eq(intentoLogin.usuario, "maria"))).toHaveLength(0);
    expect(await db.select().from(intentoLogin).where(eq(intentoLogin.usuario, "lucia"))).toHaveLength(2);
  });

  it("un éxito (borrarFallos) reinicia el conteo", async () => {
    await fallar("maria", 3);
    await borrarFallos(db, "maria");
    await registrarFallo(db, "maria", en(5_000));
    const filas = await db.select().from(intentoLogin).where(eq(intentoLogin.usuario, "maria"));
    expect(filas).toHaveLength(1);
  });

  it("con más de 5 fallos (carrera) el bloqueo dura hasta que baje del tope", async () => {
    await fallar("maria", MAX_INTENTOS_FALLIDOS + 1);
    const estado = await consultarLimite(db, "maria", en(10_000));
    // El 2.º fallo (a +1 s) es el que deja el conteo bajo 5 cuando sale de la ventana.
    expect(estado).toEqual({ bloqueado: true, reintentarEn: en(1_000 + VENTANA_INTENTOS_MS) });
  });
});
