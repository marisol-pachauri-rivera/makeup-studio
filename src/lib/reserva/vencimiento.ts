import { and, eq, gt, inArray, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva, reservaLinea } from "@/db/schema";
import { esChoqueDeHorario } from "./errores-pg";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests). Aquí `Db` es, en la práctica,
// el cliente de una transacción: todo se ejecuta en serie (pg no admite consultas simultáneas en uno).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

/**
 * Cuánto puede una reserva sin pagar ocupar su horario (ADR 0003). Constante configurable en código;
 * no hay variable de entorno.
 */
export const PLAZO_VENCIMIENTO_MINUTOS = 20;

/**
 * Una sola definición de "reserva vencida", en SQL, para que la oferta pública y la cancelación
 * nunca discrepen: en `pendiente_pago`, sin número de operación, sin motivo de rechazo (las devueltas
 * por un rechazo no vencen) y creada hace MÁS de 20 minutos (exactamente 20 todavía no vence).
 *
 * El umbral se calcula con el `ahora` que recibe quien llama, no con `now()` de la base: así las
 * pruebas son deterministas y el sesgo de reloj entre la app y la base (segundos) es despreciable
 * frente a 20 minutos. Hay que usarlo sobre una consulta que incluya la tabla `reserva`.
 */
export function condicionVencida(ahora: Date): SQL {
  const limite = new Date(ahora.getTime() - PLAZO_VENCIMIENTO_MINUTOS * 60_000);
  const condicion = and(
    eq(reserva.estado, "pendiente_pago"),
    isNull(reserva.numeroOperacion),
    isNull(reserva.motivoRechazo),
    lt(reserva.creadaEn, limite),
  );
  // `and` solo devuelve `undefined` sin condiciones.
  return condicion as SQL;
}

export type ValoresLinea = typeof reservaLinea.$inferInsert;

export type LiberacionDeVencidas = {
  /** Ids de las reservas vencidas que esta llamada canceló (con todas sus líneas). */
  canceladas: number[];
  /** Cuántas líneas en conflicto no se pudieron liberar: vigentes, o que dejaron de estar vencidas. */
  bloqueantes: number;
};

/**
 * Cancela las reservas vencidas que ocupan `[inicio, fin)` de la maquilladora y devuelve cuáles.
 *
 * El `UPDATE` repite la condición de vencimiento y es lo que decide la carrera contra el ingreso del
 * número de operación: si otra transacción está cambiando esa reserva, el `UPDATE` espera su bloqueo
 * de fila y, ya confirmada, Postgres reevalúa la condición (ahora falsa) y no afecta filas. Esa reserva
 * cuenta como bloqueante y no se toca. Debe correr dentro de la transacción de quien reserva.
 */
export async function liberarVencidasEnConflicto(
  tx: Db,
  {
    maquilladoraId,
    inicio,
    fin,
    excluirLineaId,
  }: {
    maquilladoraId: number;
    inicio: Date;
    fin: Date;
    /** Al reprogramar, la línea que se mueve: su propio horario no es un bloqueo. */
    excluirLineaId?: number;
  },
  ahora: Date,
): Promise<LiberacionDeVencidas> {
  const enConflicto = await tx
    .select({
      reservaId: reservaLinea.reservaId,
      vencida: sql<boolean>`${condicionVencida(ahora)}`.as("vencida"),
    })
    .from(reservaLinea)
    .innerJoin(reserva, eq(reserva.id, reservaLinea.reservaId))
    .where(
      and(
        eq(reservaLinea.maquilladoraId, maquilladoraId),
        eq(reservaLinea.activa, true),
        lt(reservaLinea.inicio, fin),
        gt(reservaLinea.fin, inicio),
        excluirLineaId === undefined ? undefined : ne(reservaLinea.id, excluirLineaId),
      ),
    );

  let bloqueantes = enConflicto.filter((l) => !l.vencida).length;
  const vencidas = [...new Set(enConflicto.filter((l) => l.vencida).map((l) => l.reservaId))];

  const canceladas: number[] = [];
  for (const id of vencidas) {
    const [cancelada] = await tx
      .update(reserva)
      .set({ estado: "cancelada", motivoCancelacion: "vencida" })
      .where(and(eq(reserva.id, id), condicionVencida(ahora)))
      .returning({ id: reserva.id });
    if (cancelada) canceladas.push(id);
    else bloqueantes++;
  }

  // `activa` duplica el estado de la reserva y se sincroniza en la misma transacción (ADR 0005).
  if (canceladas.length > 0) {
    await tx.update(reservaLinea).set({ activa: false }).where(inArray(reservaLinea.reservaId, canceladas));
  }
  return { canceladas, bloqueantes };
}

/** Cuántas veces se repite el insert tras liberar vencidas, por si el conflicto reaparece. */
export const MAX_REINTENTOS_DE_LIBERACION = 3;

export type ResultadoInsercion = "insertada" | "ocupado";

/**
 * Se lanza dentro de una transacción cuando una línea no pudo entrar porque algo vigente ocupa su
 * horario: deshace la transacción completa (reserva, líneas y vencidas ya canceladas) y quien llama
 * la traduce a "horario no disponible". La usan la reserva individual y la grupal.
 */
export class HorarioOcupado extends Error {
  constructor() {
    super("El horario ya no está disponible.");
    this.name = "HorarioOcupado";
  }
}

/**
 * Inserta una línea; si choca con la exclusión de horario y lo que la ocupa es una reserva vencida,
 * la cancela y reintenta, todo dentro de la transacción de quien llama (ADR 0003).
 *
 * Tras un error Postgres aborta la transacción entera, así que cada intento corre en un savepoint
 * (`tx.transaction` anidado): si falla, vuelve al savepoint y la transacción externa sigue usable.
 * Devuelve `"ocupado"` cuando algo vigente sigue ocupando el horario. Quien llama debe entonces
 * deshacer la transacción completa (así no queda cancelada ninguna vencida sin que exista la
 * reserva nueva). La reserva grupal lo usa una vez por línea, en serie. Los errores que no son un
 * choque de horario se relanzan.
 */
export async function insertarLineaLiberandoVencidas(
  tx: Db,
  valores: ValoresLinea,
  ahora: Date,
): Promise<ResultadoInsercion> {
  for (let intento = 0; ; intento++) {
    try {
      await tx.transaction((sp) => sp.insert(reservaLinea).values(valores));
      return "insertada";
    } catch (error) {
      if (!esChoqueDeHorario(error)) throw error;
      if (intento >= MAX_REINTENTOS_DE_LIBERACION) return "ocupado";

      const { canceladas, bloqueantes } = await liberarVencidasEnConflicto(
        tx,
        { maquilladoraId: valores.maquilladoraId, inicio: valores.inicio, fin: valores.fin },
        ahora,
      );
      // Nada que liberar, o algo vigente sigue ocupando: no hay reintento (ADR 0003).
      if (bloqueantes > 0 || canceladas.length === 0) return "ocupado";
    }
  }
}
