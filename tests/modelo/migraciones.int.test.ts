import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { crearDbDePrueba } from "../support/db";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

const TAGS = (
  JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] }
).entries.map((e) => e.tag);

it("las cinco migraciones del proyecto quedaron registradas", async () => {
  expect(TAGS).toHaveLength(5);
  expect(TAGS[2]).toBe("0002_reserva_linea_exclusion");
  expect(TAGS[3]).toBe("0003_intento_login");
  expect(TAGS[4]).toBe("0004_reserva_clave_idempotencia");

  const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from drizzle.__drizzle_migrations`);
  expect(Number(rows[0].n)).toBe(TAGS.length);
});

it("existen la extensión btree_gist y la restricción de exclusión", async () => {
  const ext = await db.execute(sql`select 1 from pg_extension where extname = 'btree_gist'`);
  expect(ext.rows).toHaveLength(1);

  const { rows } = await db.execute<{ definicion: string }>(sql`
    select pg_get_constraintdef(oid) as definicion
    from pg_constraint
    where conname = 'reserva_linea_sin_solapamiento' and contype = 'x'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].definicion).toMatch(/EXCLUDE USING gist/);
  expect(rows[0].definicion).toMatch(/WHERE \(?activa\)?/);
});

it("existen las 8 tablas del modelo", async () => {
  const { rows } = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
  expect(rows.map((r) => r.table_name)).toEqual([
    "bloqueo_agenda",
    "horario_trabajo",
    "intento_login",
    "maquilladora",
    "reserva",
    "reserva_linea",
    "servicio",
    "usuario_admin",
  ]);
});
