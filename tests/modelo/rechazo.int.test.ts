import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { crearDbDePrueba, enTransaccionRevertida } from "../support/db";
import { esperarRechazo } from "../support/rechazo";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

describe("esperarRechazo", () => {
  it("devuelve el código y la restricción, y deja la transacción utilizable", async () => {
    await enTransaccionRevertida(db, async (tx) => {
      await tx.execute(sql`create table t (id int constraint t_id_unico unique)`);
      await tx.execute(sql`insert into t values (1)`);

      const rechazo = await esperarRechazo(tx, (sp) => sp.execute(sql`insert into t values (1)`));

      expect(rechazo).toEqual({ codigo: "23505", restriccion: "t_id_unico" });
      const { rows } = await tx.execute<{ n: string }>(sql`select count(*) as n from t`);
      expect(rows[0].n).toBe("1");
    });
  });

  it("falla si la operación es aceptada", async () => {
    await enTransaccionRevertida(db, async (tx) => {
      await tx.execute(sql`create table t (id int)`);
      await expect(esperarRechazo(tx, (sp) => sp.execute(sql`insert into t values (1)`))).rejects.toThrow(
        /se aceptó/,
      );
    });
  });
});
