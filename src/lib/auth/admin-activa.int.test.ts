import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { usuarioAdmin } from "@/db/schema";
import { crearDbDePrueba } from "../../../tests/support/db";
import { buscarAdminDeSesion } from "./admin-activa";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(sql`truncate table usuario_admin restart identity cascade`);
});

async function crearAdmin(usuario = "maria") {
  const [fila] = await db.insert(usuarioAdmin).values({ usuario, passwordHash: "hash" }).returning();
  return fila;
}

describe("buscarAdminDeSesion", () => {
  it("con sesión de una administradora existente la devuelve", async () => {
    const admin = await crearAdmin();
    expect(await buscarAdminDeSesion(db, { user: { id: String(admin.id) } })).toEqual({ id: admin.id, usuario: "maria" });
  });

  it.each([[null], [undefined], [{}], [{ user: null }], [{ user: {} }], [{ user: { id: "" } }], [{ user: { id: "abc" } }]])(
    "sin sesión usable (%j) devuelve null",
    async (sesion) => {
      await crearAdmin();
      expect(await buscarAdminDeSesion(db, sesion)).toBeNull();
    },
  );

  it("si la administradora fue dada de baja, la sesión deja de valer", async () => {
    const admin = await crearAdmin();
    await db.execute(sql`delete from usuario_admin where id = ${admin.id}`);
    expect(await buscarAdminDeSesion(db, { user: { id: String(admin.id) } })).toBeNull();
  });

  it("un id de otra persona no devuelve a la administradora equivocada", async () => {
    const a = await crearAdmin("maria");
    const b = await crearAdmin("lucia");
    expect(await buscarAdminDeSesion(db, { user: { id: String(b.id) } })).toEqual({ id: b.id, usuario: "lucia" });
    expect(a.id).not.toBe(b.id);
  });
});
