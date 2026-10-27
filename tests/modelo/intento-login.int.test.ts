import { and, count, eq, gte, sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { intentoLogin, usuarioAdmin } from "@/db/schema";
import { crearDbDePrueba } from "../support/db";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

beforeEach(async () => {
  await db.execute(sql`truncate table intento_login, usuario_admin restart identity cascade`);
});

it("guarda un fallo de un usuario que no existe como administradora", async () => {
  const [fila] = await db.insert(intentoLogin).values({ usuario: "fantasma" }).returning();
  expect(fila.usuario).toBe("fantasma");
  expect(fila.intentadoEn).toBeInstanceOf(Date);
  expect(await db.select().from(usuarioAdmin)).toHaveLength(0);
});

it("cuenta los fallos por usuario dentro de una ventana", async () => {
  const ahora = Date.now();
  const hace = (min: number) => new Date(ahora - min * 60_000);
  await db.insert(intentoLogin).values([
    { usuario: "maria", intentadoEn: hace(20) },
    { usuario: "maria", intentadoEn: hace(10) },
    { usuario: "maria", intentadoEn: hace(1) },
    { usuario: "otra", intentadoEn: hace(1) },
  ]);

  const [{ n }] = await db
    .select({ n: count() })
    .from(intentoLogin)
    .where(and(eq(intentoLogin.usuario, "maria"), gte(intentoLogin.intentadoEn, hace(15))));
  expect(n).toBe(2);
});

it("no tiene ninguna columna que pueda guardar una contraseña", async () => {
  const { rows } = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'intento_login' order by column_name`);
  expect(rows.map((r) => r.column_name)).toEqual(["id", "intentado_en", "usuario"]);
});

it("el índice por usuario e instante existe y lo usa la consulta de la ventana", async () => {
  const { rows } = await db.execute<{ indexdef: string }>(sql`
    select indexdef from pg_indexes
    where tablename = 'intento_login' and indexname = 'intento_login_usuario_instante_idx'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].indexdef).toMatch(/\(usuario, intentado_en\)/);

  // Con pocas filas el planificador prefiere recorrer la tabla; se fuerza para probar que el índice sirve.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local enable_seqscan = off`);
    const plan = await tx.execute<{ "QUERY PLAN": string }>(sql`
      explain select count(*) from intento_login where usuario = 'maria' and intentado_en >= now() - interval '15 minutes'`);
    expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toMatch(/intento_login_usuario_instante_idx/);
  });
});
