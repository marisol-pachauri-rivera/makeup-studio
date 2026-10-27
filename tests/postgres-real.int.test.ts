import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { crearDbDePrueba, enTransaccionRevertida } from "./support/db";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

describe("PostgreSQL real", () => {
  it("responde con un servidor PostgreSQL de verdad", async () => {
    const { rows } = await db.execute<{ version: string }>(sql`select version()`);
    expect(rows[0].version).toMatch(/^PostgreSQL 17/);
  });

  it("soporta restricciones de exclusión con btree_gist", async () => {
    await enTransaccionRevertida(db, async (tx) => {
      await tx.execute(sql`create extension if not exists btree_gist`);
      await tx.execute(sql`create table t (m int, r tstzrange, exclude using gist (m with =, r with &&))`);
      await tx.execute(sql`insert into t values (1, '[2026-01-01 10:00,2026-01-01 11:00)')`);
      await expect(
        tx.transaction((s) => s.execute(sql`insert into t values (1, '[2026-01-01 10:30,2026-01-01 11:30)')`)),
      ).rejects.toMatchObject({ cause: { code: "23P01" } });
    });
  });
});

describe("aislamiento entre tests", () => {
  // Ambos tests crean la misma tabla: si uno filtrara estado al otro, el segundo fallaría.
  for (const nombre of ["primero", "segundo"]) {
    it(`${nombre}: parte de un estado limpio`, async () => {
      await enTransaccionRevertida(db, async (tx) => {
        await tx.execute(sql`create table aislamiento (id int)`);
        await tx.execute(sql`insert into aislamiento values (1)`);
        const { rows } = await tx.execute<{ n: string }>(sql`select count(*) as n from aislamiento`);
        expect(rows[0].n).toBe("1");
      });
    });
  }
});
