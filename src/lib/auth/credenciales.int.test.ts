import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { intentoLogin, usuarioAdmin } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { autorizar } from "./credenciales";
import { MAX_INTENTOS_FALLIDOS, VENTANA_INTENTOS_MS } from "./limite-intentos";
import { hashearPassword } from "./password";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

const PASSWORD = "clave-correcta-123";
let adminId: number;

beforeAll(async () => {
  // Un solo hash para todo el archivo: bcrypt a costo 12 es lento.
  const passwordHash = await hashearPassword(PASSWORD);
  await db.execute(sql`truncate table intento_login, usuario_admin restart identity cascade`);
  const [fila] = await db.insert(usuarioAdmin).values({ usuario: "Maria", passwordHash }).returning();
  adminId = fila.id;
});

beforeEach(async () => {
  await db.execute(sql`truncate table intento_login restart identity`);
});

const intento = (usuario: string, password: string) => autorizar(db, { usuario, password });
const fallos = (usuario: string) => db.select().from(intentoLogin).where(eq(intentoLogin.usuario, usuario));

describe("autorizar", () => {
  it("credenciales correctas devuelven la administradora", async () => {
    expect(await intento("Maria", PASSWORD)).toEqual({ ok: true, admin: { id: String(adminId), usuario: "Maria" } });
  });

  it("ignora mayúsculas y espacios en los extremos del usuario", async () => {
    expect((await intento("  maria ", PASSWORD)).ok).toBe(true);
    expect((await intento("MARIA", PASSWORD)).ok).toBe(true);
  });

  it("contraseña incorrecta y usuario inexistente dan el mismo resultado y suman un fallo", async () => {
    expect(await intento("maria", "equivocada")).toEqual({ ok: false, motivo: "invalidas" });
    expect(await intento("nadie", "equivocada")).toEqual({ ok: false, motivo: "invalidas" });
    expect(await fallos("maria")).toHaveLength(1);
    expect(await fallos("nadie")).toHaveLength(1);
  });

  it.each([
    [{ usuario: "", password: PASSWORD }],
    [{ usuario: "maria", password: "" }],
    [{ usuario: "   ", password: PASSWORD }],
    [{ usuario: 123, password: PASSWORD }],
    [{ usuario: "maria" }],
    [null],
    ["texto"],
  ])("entrada inválida %j se rechaza sin consultar ni registrar fallos", async (entrada) => {
    expect(await autorizar(db, entrada)).toEqual({ ok: false, motivo: "datos" });
    expect(await db.select().from(intentoLogin)).toHaveLength(0);
  });

  it("tras 5 fallos bloquea aun con la contraseña correcta, sin sumar fallos", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await intento("maria", "equivocada");
    expect(await intento("maria", PASSWORD)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await intento("maria", "equivocada")).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await fallos("maria")).toHaveLength(MAX_INTENTOS_FALLIDOS);
  });

  it("un usuario inexistente se bloquea igual, con el mismo resultado que uno real", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await intento("nadie", "x");
    expect(await intento("nadie", "x")).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("pasada la ventana vuelve a permitir el inicio de sesión", async () => {
    const t0 = new Date("2026-01-10T12:00:00Z");
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await autorizar(db, { usuario: "maria", password: "x" }, t0);
    const antes = new Date(t0.getTime() + VENTANA_INTENTOS_MS - 1);
    const despues = new Date(t0.getTime() + VENTANA_INTENTOS_MS + 1);
    expect((await autorizar(db, { usuario: "maria", password: PASSWORD }, antes)).ok).toBe(false);
    expect((await autorizar(db, { usuario: "maria", password: PASSWORD }, despues)).ok).toBe(true);
  });

  it("un éxito borra los fallos acumulados y el siguiente error cuenta como el primero", async () => {
    for (let i = 0; i < 3; i++) await intento("maria", "equivocada");
    expect((await intento("maria", PASSWORD)).ok).toBe(true);
    expect(await fallos("maria")).toHaveLength(0);
    await intento("maria", "equivocada");
    expect(await fallos("maria")).toHaveLength(1);
  });
});
