import { eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { usuarioAdmin } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { altaAdmin } from "./alta-admin";
import { autorizar } from "./credenciales";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(sql`truncate table intento_login, usuario_admin restart identity cascade`);
});

const PASSWORD = "una-clave-bien-larga";
const filas = () => db.select().from(usuarioAdmin);

describe("altaAdmin", () => {
  it("crea la administradora guardando solo el hash, y puede iniciar sesión", async () => {
    expect(await altaAdmin(db, { usuario: "  Maria ", password: PASSWORD })).toEqual({
      creada: true,
      usuario: "maria",
    });

    const [fila] = await filas();
    expect(fila.usuario).toBe("maria");
    expect(fila.passwordHash).not.toContain(PASSWORD);
    expect(fila.passwordHash).toMatch(/^\$2[aby]\$/);
    expect((await autorizar(db, { usuario: "MARIA", password: PASSWORD })).ok).toBe(true);
  });

  it("un usuario existente no se modifica (ni su hash)", async () => {
    await altaAdmin(db, { usuario: "maria", password: PASSWORD });
    const [antes] = await filas();

    expect(await altaAdmin(db, { usuario: "MARIA", password: "otra-clave-muy-larga" })).toEqual({
      creada: false,
      usuario: "maria",
      motivo: "existe",
    });

    const despues = await db.select().from(usuarioAdmin).where(eq(usuarioAdmin.id, antes.id));
    expect(despues).toHaveLength(1);
    expect(despues[0].passwordHash).toBe(antes.passwordHash);
    expect(await filas()).toHaveLength(1);
  });

  it("detecta como existente a una administradora cargada con otras mayúsculas", async () => {
    await db.insert(usuarioAdmin).values({ usuario: "Lucia", passwordHash: "hash" });
    expect(await altaAdmin(db, { usuario: "lucia", password: PASSWORD })).toMatchObject({ creada: false });
    expect(await filas()).toHaveLength(1);
  });

  it.each([
    ["una contraseña de 11 caracteres", { usuario: "maria", password: "x".repeat(11) }],
    ["sin contraseña", { usuario: "maria" }],
    ["un usuario vacío", { usuario: "  ", password: PASSWORD }],
    ["una contraseña de más de 72 bytes", { usuario: "maria", password: "ñ".repeat(37) }],
  ])("rechaza %s sin crear nada", async (_caso, entrada) => {
    await expect(altaAdmin(db, entrada)).rejects.toBeInstanceOf(ZodError);
    expect(await filas()).toHaveLength(0);
  });

  it("acepta una contraseña de exactamente 12 caracteres", async () => {
    expect((await altaAdmin(db, { usuario: "maria", password: "x".repeat(12) })).creada).toBe(true);
  });

  it("los mensajes de error no incluyen la contraseña", async () => {
    const secreta = "corta-123";
    const error = await altaAdmin(db, { usuario: "maria", password: secreta }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(JSON.stringify((error as ZodError).issues)).not.toContain(secreta);
  });
});
