import { describe, expect, it, vi } from "vitest";
import { insertarLineaLiberandoVencidas, MAX_REINTENTOS_DE_LIBERACION, type ValoresLinea } from "./vencimiento";

const AHORA = new Date("2026-12-21T15:00:00Z");
const valores: ValoresLinea = {
  reservaId: 7,
  persona: "Lucía",
  servicioId: 1,
  maquilladoraId: 2,
  inicio: new Date("2026-12-21T15:00:00Z"),
  fin: new Date("2026-12-21T16:00:00Z"),
  precio: "120.00",
};

const pg = (code: string) => Object.assign(new Error("pg"), { code });

/** Cadena de Drizzle que se puede esperar y devuelve `filas`, sea cual sea el tramo final. */
const cadena = (filas: unknown[]) => {
  const c: Record<string, unknown> = {};
  for (const metodo of ["from", "innerJoin", "where", "set", "values", "returning"]) c[metodo] = () => c;
  c.then = (resolver: (f: unknown[]) => unknown) => resolver(filas);
  return c;
};

/**
 * Una transacción simulada: el insert falla con los errores indicados (en orden) y luego se acepta;
 * lo que haya en conflicto lo decide `enConflicto` (filas del select) y `cancela` (filas del UPDATE).
 */
function txSimulada(opciones: { fallos: Error[]; enConflicto?: unknown[]; cancela?: unknown[] }) {
  const fallos = [...opciones.fallos];
  const inserts = vi.fn();
  const updates = vi.fn();
  const tx = {
    transaction: async (callback: (sp: unknown) => Promise<unknown>) =>
      callback({
        insert: () => ({
          values: async (v: unknown) => {
            inserts(v);
            const fallo = fallos.shift();
            if (fallo) throw fallo;
          },
        }),
      }),
    select: () => cadena(opciones.enConflicto ?? []),
    update: () => {
      updates();
      return cadena(opciones.cancela ?? []);
    },
  };
  return { tx: tx as never, inserts, updates };
}

describe("insertarLineaLiberandoVencidas (con una transacción simulada)", () => {
  it("inserta sin más cuando no hay choque", async () => {
    const { tx, inserts, updates } = txSimulada({ fallos: [] });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("insertada");
    expect(inserts).toHaveBeenCalledTimes(1);
    expect(updates).not.toHaveBeenCalled();
  });

  it("relanza un error que no es un choque de horario, sin intentar liberar nada", async () => {
    const { tx, updates } = txSimulada({ fallos: [pg("53100")] });
    await expect(insertarLineaLiberandoVencidas(tx, valores, AHORA)).rejects.toThrow("pg");
    expect(updates).not.toHaveBeenCalled();
  });

  it("devuelve ocupado si el choque no es con una reserva vencida", async () => {
    const { tx, inserts, updates } = txSimulada({
      fallos: [pg("23P01")],
      enConflicto: [{ reservaId: 9, vencida: false }],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("ocupado");
    expect(inserts).toHaveBeenCalledTimes(1);
    expect(updates).not.toHaveBeenCalled();
  });

  it("devuelve ocupado si ya no queda nada que liberar", async () => {
    const { tx, inserts } = txSimulada({ fallos: [pg("23P01")], enConflicto: [] });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("ocupado");
    expect(inserts).toHaveBeenCalledTimes(1);
  });

  it("devuelve ocupado si la vencida dejó de estarlo (el UPDATE no afecta filas)", async () => {
    const { tx, inserts } = txSimulada({
      fallos: [pg("23P01")],
      enConflicto: [{ reservaId: 9, vencida: true }],
      cancela: [],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("ocupado");
    expect(inserts).toHaveBeenCalledTimes(1);
  });

  it("devuelve ocupado si hay una vencida y una vigente a la vez", async () => {
    const { tx, inserts } = txSimulada({
      fallos: [pg("23P01")],
      enConflicto: [
        { reservaId: 9, vencida: true },
        { reservaId: 10, vencida: false },
      ],
      cancela: [{ id: 9 }],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("ocupado");
    expect(inserts).toHaveBeenCalledTimes(1);
  });

  it.each(["23P01", "40P01"])("libera la vencida y reintenta tras un %s", async (codigo) => {
    const { tx, inserts } = txSimulada({
      fallos: [pg(codigo)],
      enConflicto: [{ reservaId: 9, vencida: true }],
      cancela: [{ id: 9 }],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("insertada");
    expect(inserts).toHaveBeenCalledTimes(2);
  });

  it("reconoce un choque envuelto en cause", async () => {
    const { tx } = txSimulada({
      fallos: [new Error("Failed query", { cause: pg("23P01") })],
      enConflicto: [{ reservaId: 9, vencida: true }],
      cancela: [{ id: 9 }],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("insertada");
  });

  it("deja de reintentar al llegar al tope", async () => {
    const siempre = Array.from({ length: 10 }, () => pg("23P01"));
    const { tx, inserts } = txSimulada({
      fallos: siempre,
      enConflicto: [{ reservaId: 9, vencida: true }],
      cancela: [{ id: 9 }],
    });
    expect(await insertarLineaLiberandoVencidas(tx, valores, AHORA)).toBe("ocupado");
    expect(inserts).toHaveBeenCalledTimes(MAX_REINTENTOS_DE_LIBERACION + 1);
  });
});
