import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva, reservaLinea } from "@/db/schema";
import { PLAZO_CANCELACION_HORAS } from "./plazo";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type ResultadoCancelacion =
  /** La reserva quedó cancelada por la clienta (con esta llamada o con una anterior suya: el doble clic no es un error). */
  | { estado: "cancelada" }
  /** La reserva ya estaba cancelada por otro motivo (vencimiento o studio). Nada cambió. */
  | { estado: "ya_cancelada" }
  /** Faltan menos de 24 horas para el primer turno. Nada cambió. */
  | { estado: "fuera_de_plazo" }
  /** Ninguna reserva tiene ese token. */
  | { estado: "no_encontrada" };

const INTENTOS = 2;

/**
 * Cancela la reserva completa desde el enlace (la clienta no tiene cuenta: el token es su credencial).
 *
 * Es UN `UPDATE` de la reserva condicionado al estado (los tres vivos) y a que el primer turno activo
 * esté a 24 horas o más de `ahora`, seguido, en la misma transacción y en serie, de la baja de las
 * líneas (`activa = false`, ADR 0005). Decide el servidor, no la pantalla. El reembolso se fija en la
 * misma sentencia según el estado que la reserva tenga al ejecutarse: si el studio valida o rechaza a
 * la vez, el segundo `UPDATE` espera el bloqueo de fila y Postgres reevalúa el `WHERE` y el `CASE`
 * sobre la versión confirmada, así que gana exactamente uno y el reembolso refleja el estado final.
 *
 * `pendiente_pago` queda `no_aplica` (no hay pago); `pendiente_validacion` y `confirmada` quedan
 * `pendiente` (la clienta informó un pago; que `pendiente_validacion` sea `pendiente` es un supuesto a
 * confirmar con el studio, ver el design del cambio). El número de operación se conserva: hace falta
 * para devolver el pago. `ahora` lo pasa quien llama, como en `condicionVencida`, para pruebas
 * deterministas.
 */
export async function cancelarReservaDeLaClienta(
  db: Db,
  { token }: { token: string },
  ahora: Date,
): Promise<ResultadoCancelacion> {
  for (let intento = 1; ; intento++) {
    const cancelada = await db.transaction(async (tx) => {
      const [fila] = await tx
        .update(reserva)
        .set({
          estado: "cancelada",
          motivoCancelacion: "clienta",
          estadoReembolso: sql`case when ${reserva.estado} = 'pendiente_pago' then 'no_aplica' else 'pendiente' end`,
        })
        .where(
          and(
            eq(reserva.token, token),
            inArray(reserva.estado, ["pendiente_pago", "pendiente_validacion", "confirmada"]),
            sql`(select min(${reservaLinea.inicio}) from ${reservaLinea}
                  where ${reservaLinea.reservaId} = ${reserva.id} and ${reservaLinea.activa})
                >= ${ahora.toISOString()}::timestamptz + make_interval(hours => ${PLAZO_CANCELACION_HORAS})`,
          ),
        )
        .returning({ id: reserva.id });
      if (!fila) return false;
      await tx.update(reservaLinea).set({ activa: false }).where(eq(reservaLinea.reservaId, fila.id));
      return true;
    });
    if (cancelada) return { estado: "cancelada" };

    // No se actualizó nada: se lee la reserva para explicar por qué.
    const [actual] = await db
      .select({ estado: reserva.estado, motivoCancelacion: reserva.motivoCancelacion })
      .from(reserva)
      .where(eq(reserva.token, token));

    if (!actual) return { estado: "no_encontrada" };
    if (actual.estado === "cancelada") {
      return { estado: actual.motivoCancelacion === "clienta" ? "cancelada" : "ya_cancelada" };
    }
    // Viva y sin cancelar: o falta el plazo, o una transacción que la tocaba se deshizo entre medias.
    const [turno] = await db
      .select({ primero: sql<Date | null>`min(${reservaLinea.inicio})` })
      .from(reservaLinea)
      .innerJoin(reserva, eq(reserva.id, reservaLinea.reservaId))
      .where(and(eq(reserva.token, token), eq(reservaLinea.activa, true)));
    const plazoOk =
      turno?.primero != null && new Date(turno.primero).getTime() >= ahora.getTime() + PLAZO_CANCELACION_HORAS * 3_600_000;
    if (!plazoOk) return { estado: "fuera_de_plazo" };
    if (intento >= INTENTOS) throw new Error("La reserva admite cancelarse pero no se pudo actualizar.");
  }
}
