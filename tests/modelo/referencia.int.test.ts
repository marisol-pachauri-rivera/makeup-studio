import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { bloqueoAgenda, horarioTrabajo, maquilladora, servicio, usuarioAdmin } from "@/db/schema";
import { crearDbDePrueba, enTransaccionRevertida } from "../support/db";
import { esperarRechazo } from "../support/rechazo";

const { db, cerrar } = crearDbDePrueba();
afterAll(cerrar);

const CHECK = "23514";
const UNIQUE = "23505";
const FK = "23503";

const servicioValido = { nombre: "Maquillaje social", precio: "120.00", duracionMinutos: 60 };

describe("servicio", () => {
  it("guarda un servicio válido, activo por defecto", () =>
    enTransaccionRevertida(db, async (tx) => {
      const [s] = await tx.insert(servicio).values(servicioValido).returning();
      expect(s).toMatchObject({ activo: true, descripcion: "", precio: "120.00" });
    }));

  it("acepta precio 0", () =>
    enTransaccionRevertida(db, async (tx) => {
      await tx.insert(servicio).values({ ...servicioValido, precio: "0" });
    }));

  it("rechaza precio negativo al insertar y al actualizar", () =>
    enTransaccionRevertida(db, async (tx) => {
      const insertar = await esperarRechazo(tx, (sp) =>
        sp.insert(servicio).values({ ...servicioValido, precio: "-1" }),
      );
      expect(insertar).toEqual({ codigo: CHECK, restriccion: "servicio_precio_no_negativo" });

      const [s] = await tx.insert(servicio).values(servicioValido).returning();
      const actualizar = await esperarRechazo(tx, (sp) =>
        sp.update(servicio).set({ precio: "-5" }).where(eq(servicio.id, s.id)),
      );
      expect(actualizar.restriccion).toBe("servicio_precio_no_negativo");
    }));

  it.each([0, -30])("rechaza duración %i", (duracionMinutos) =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await esperarRechazo(tx, (sp) => sp.insert(servicio).values({ ...servicioValido, duracionMinutos }));
      expect(r).toEqual({ codigo: CHECK, restriccion: "servicio_duracion_positiva" });
    }),
  );
});

describe("maquilladora", () => {
  it("queda activa por defecto", () =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      expect(m.activa).toBe(true);
    }));

  it("no se puede borrar si tiene referencias", () =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      await tx.insert(horarioTrabajo).values({
        maquilladoraId: m.id,
        diaSemana: 1,
        horaInicio: "09:00",
        horaFin: "18:00",
      });

      const r = await esperarRechazo(tx, (sp) => sp.delete(maquilladora).where(eq(maquilladora.id, m.id)));

      expect(r.codigo).toBe(FK);
      expect(await tx.select().from(maquilladora).where(eq(maquilladora.id, m.id))).toHaveLength(1);
    }));
});

describe("horario_trabajo", () => {
  const horario = (maquilladoraId: number, extra: Partial<typeof horarioTrabajo.$inferInsert> = {}) => ({
    maquilladoraId,
    diaSemana: 1,
    horaInicio: "09:00",
    horaFin: "18:00",
    ...extra,
  });

  it("guarda un horario de lunes de 09:00 a 18:00", () =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      const [h] = await tx.insert(horarioTrabajo).values(horario(m.id)).returning();
      expect(h).toMatchObject({ diaSemana: 1, horaInicio: "09:00:00", horaFin: "18:00:00" });
    }));

  it.each(["09:00", "08:00"])("rechaza un fin (%s) que no es posterior al inicio", (horaFin) =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      const r = await esperarRechazo(tx, (sp) => sp.insert(horarioTrabajo).values(horario(m.id, { horaFin })));
      expect(r).toEqual({ codigo: CHECK, restriccion: "horario_trabajo_fin_posterior" });
    }),
  );

  it.each([7, -1])("rechaza el día de la semana %i", (diaSemana) =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      const r = await esperarRechazo(tx, (sp) => sp.insert(horarioTrabajo).values(horario(m.id, { diaSemana })));
      expect(r).toEqual({ codigo: CHECK, restriccion: "horario_trabajo_dia_valido" });
    }),
  );

  it("rechaza un horario de una maquilladora inexistente", () =>
    enTransaccionRevertida(db, async (tx) => {
      const r = await esperarRechazo(tx, (sp) => sp.insert(horarioTrabajo).values(horario(999_999)));
      expect(r.codigo).toBe(FK);
    }));
});

describe("bloqueo_agenda", () => {
  const bloqueo = (maquilladoraId: number, inicio: string, fin: string) => ({
    maquilladoraId,
    inicio: new Date(inicio),
    fin: new Date(fin),
    motivo: "Vacaciones",
  });

  it("guarda un bloqueo con fin posterior al inicio", () =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      await tx.insert(bloqueoAgenda).values(bloqueo(m.id, "2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z"));
    }));

  it.each([
    ["fin anterior", "2026-01-01T09:00:00Z"],
    ["fin igual", "2026-01-01T10:00:00Z"],
  ])("rechaza un rango invertido (%s)", (_n, fin) =>
    enTransaccionRevertida(db, async (tx) => {
      const [m] = await tx.insert(maquilladora).values({ nombre: "Ana" }).returning();
      const r = await esperarRechazo(tx, (sp) =>
        sp.insert(bloqueoAgenda).values(bloqueo(m.id, "2026-01-01T10:00:00Z", fin)),
      );
      expect(r).toEqual({ codigo: CHECK, restriccion: "bloqueo_agenda_fin_posterior" });
    }),
  );
});

describe("usuario_admin", () => {
  it("rechaza un nombre de usuario repetido", () =>
    enTransaccionRevertida(db, async (tx) => {
      await tx.insert(usuarioAdmin).values({ usuario: "studio", passwordHash: "hash-1" });
      const r = await esperarRechazo(tx, (sp) =>
        sp.insert(usuarioAdmin).values({ usuario: "studio", passwordHash: "hash-2" }),
      );
      expect(r).toEqual({ codigo: UNIQUE, restriccion: "usuario_admin_usuario_unico" });
    }));

  it("no tiene ninguna columna para una contraseña en claro", async () => {
    const { rows } = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'usuario_admin'`,
    );
    const columnas = rows.map((r) => r.column_name);
    expect(columnas).toContain("password_hash");
    expect(columnas).not.toContain("password");
  });
});
