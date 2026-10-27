import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva, reservaLinea } from "@/db/schema";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

type EstadoDeReserva = (typeof reserva.$inferSelect)["estado"];

export type ResultadoTransicion =
  /** La reserva cambió de estado con esta operación. */
  | { estado: "aplicada" }
  /** La reserva ya estaba en el estado destino (por ejemplo, un doble clic): no cambió nada. */
  | { estado: "ya_aplicada"; actual: EstadoDeReserva }
  /** La reserva está en otro estado y la operación no se puede aplicar. Nada cambió. */
  | { estado: "estado_distinto"; actual: EstadoDeReserva }
  /** Ninguna reserva tiene ese identificador. */
  | { estado: "no_encontrada" };

const INTENTOS = 2;

/**
 * Corre una transición hasta decidir su resultado. `aplicar` devuelve `true` si el `UPDATE` afectó una
 * fila. Si no afectó ninguna, se lee la reserva para explicar por qué (`explicar`). Si la lectura
 * encuentra la reserva todavía en el estado esperado, otra transacción que la tocaba se deshizo entre
 * el `UPDATE` y la lectura: se reintenta una vez (mismo patrón que `ingresarNumeroDeOperacion`).
 */
async function transicionar(
  db: Db,
  id: number,
  aplicar: () => Promise<boolean>,
  explicar: (actual: { estado: EstadoDeReserva; motivoRechazo: string | null }) => ResultadoTransicion | "reintentar",
): Promise<ResultadoTransicion> {
  for (let intento = 1; ; intento++) {
    if (await aplicar()) return { estado: "aplicada" };

    const [actual] = await db
      .select({ estado: reserva.estado, motivoRechazo: reserva.motivoRechazo })
      .from(reserva)
      .where(eq(reserva.id, id));
    if (!actual) return { estado: "no_encontrada" };

    const resultado = explicar(actual);
    if (resultado !== "reintentar") return resultado;
    if (intento >= INTENTOS) throw new Error(`La reserva ${id} sigue en el estado esperado pero no se pudo actualizar.`);
  }
}

/**
 * Validar el pago: `pendiente_validacion` → `confirmada`, guardando `validada_en`. Es UN `UPDATE`
 * condicionado al estado esperado: ante otra operación sobre la misma reserva (otra administradora,
 * un rechazo, una cancelación) el segundo `UPDATE` espera el bloqueo de fila y Postgres reevalúa su
 * condición, así que gana exactamente una. No toca el número ni las líneas.
 */
export function validarReserva(db: Db, id: number): Promise<ResultadoTransicion> {
  return transicionar(
    db,
    id,
    async () => {
      const filas = await db
        .update(reserva)
        .set({ estado: "confirmada", validadaEn: sql`now()` })
        .where(and(eq(reserva.id, id), eq(reserva.estado, "pendiente_validacion")))
        .returning({ id: reserva.id });
      return filas.length > 0;
    },
    ({ estado }) => {
      if (estado === "pendiente_validacion") return "reintentar";
      return estado === "confirmada" ? { estado: "ya_aplicada", actual: estado } : { estado: "estado_distinto", actual: estado };
    },
  );
}

/**
 * Rechazar el pago: `pendiente_validacion` → `pendiente_pago` en UNA sentencia (ADR 0005). El número se
 * pone en nulo (queda libre bajo el `UNIQUE`), se guarda el motivo y las líneas siguen activas: el
 * horario se conserva. Una sola sentencia hace que el `CHECK` de estado y número nunca vea un estado a
 * medias, así que no hace falta transacción. `motivo` ya viene recortado y acotado por `rechazoSchema`.
 */
export function rechazarReserva(db: Db, id: number, motivo: string): Promise<ResultadoTransicion> {
  return transicionar(
    db,
    id,
    async () => {
      const filas = await db
        .update(reserva)
        .set({ estado: "pendiente_pago", numeroOperacion: null, motivoRechazo: motivo })
        .where(and(eq(reserva.id, id), eq(reserva.estado, "pendiente_validacion")))
        .returning({ id: reserva.id });
      return filas.length > 0;
    },
    ({ estado, motivoRechazo }) => {
      if (estado === "pendiente_validacion") return "reintentar";
      // Devuelta por un rechazo (el suyo, en un doble clic): la clienta aún no informó otro número.
      if (estado === "pendiente_pago" && motivoRechazo !== null) return { estado: "ya_aplicada", actual: estado };
      return { estado: "estado_distinto", actual: estado };
    },
  );
}

/**
 * Cancelar desde el panel: cualquier estado no cancelado → `cancelada` con motivo `studio` y todas las
 * líneas inactivas (el horario se libera), en una transacción de dos sentencias en serie. Una
 * `confirmada` deja el reembolso `pendiente`: el pago ya validado se devuelve; en los demás estados el
 * reembolso queda como estaba. El `UPDATE` de la reserva va primero y decide la carrera contra el
 * ingreso del número (#10) y contra el vencimiento (#8): quien llega segundo ve la condición falsa.
 */
export function cancelarReserva(db: Db, id: number): Promise<ResultadoTransicion> {
  return transicionar(
    db,
    id,
    () =>
      db.transaction(async (tx) => {
        const filas = await tx
          .update(reserva)
          .set({
            estado: "cancelada",
            motivoCancelacion: "studio",
            estadoReembolso: sql`case when ${reserva.estado} = 'confirmada' then 'pendiente' else ${reserva.estadoReembolso} end`,
          })
          .where(and(eq(reserva.id, id), ne(reserva.estado, "cancelada")))
          .returning({ id: reserva.id });
        if (filas.length === 0) return false;
        // `activa` duplica el estado de la reserva y se sincroniza en la misma transacción (ADR 0005).
        await tx.update(reservaLinea).set({ activa: false }).where(eq(reservaLinea.reservaId, id));
        return true;
      }),
    ({ estado }) => (estado === "cancelada" ? { estado: "ya_aplicada", actual: estado } : "reintentar"),
  );
}
