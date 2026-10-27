import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva } from "@/db/schema";
import { leerErrorPg, UNICO } from "@/lib/reserva/errores-pg";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export const RESTRICCION_NUMERO = "reserva_numero_operacion_unico";

export type ResultadoIngreso =
  /** El número quedó guardado y la reserva en `pendiente_validacion` (o ya lo estaba con ese número). */
  | { estado: "registrado" }
  /** Otra reserva ya usa ese número. Nada cambió. */
  | { estado: "numero_usado" }
  /** La reserva fue cancelada por vencimiento: la clienta debe elegir otro horario. */
  | { estado: "vencida" }
  /** La reserva fue cancelada por otro motivo (el studio o la propia clienta). */
  | { estado: "cancelada" }
  /** El pago ya fue informado con otro número y el studio lo está revisando. */
  | { estado: "pago_ya_informado" }
  /** La reserva ya está confirmada. */
  | { estado: "ya_confirmada" }
  /** Ninguna reserva tiene ese token. */
  | { estado: "no_encontrada" };

const INTENTOS = 2;

/**
 * Informa el pago de una reserva: guarda el número de operación y la pasa a `pendiente_validacion`.
 *
 * Es UNA sentencia `UPDATE` condicionada a que la reserva siga en `pendiente_pago` y sin número, así que
 * no hace falta transacción y el `CHECK` de la base mantiene estado y número coherentes. Eso también
 * decide la carrera contra el vencimiento lazy (#8): la cancelación es otro `UPDATE` condicionado sobre
 * la misma fila; si coinciden, el segundo espera el bloqueo del primero y, ya confirmado, Postgres
 * reevalúa su condición. Gana exactamente uno. No mira el reloj: una reserva con el plazo pasado que
 * nadie canceló todavía acepta el número (ADR 0003).
 *
 * Dos reservas con el mismo número a la vez: la segunda espera en el índice único y recibe `23505`.
 * `numero` ya viene normalizado (mayúsculas, sin espacios) por `numeroOperacionSchema`.
 */
export async function ingresarNumeroDeOperacion(
  db: Db,
  { token, numero }: { token: string; numero: string },
): Promise<ResultadoIngreso> {
  for (let intento = 1; ; intento++) {
    try {
      const [fila] = await db
        .update(reserva)
        // Tras un rechazo del pago el motivo se limpia al informar un número nuevo (ADR 0005).
        .set({ numeroOperacion: numero, estado: "pendiente_validacion", motivoRechazo: null })
        .where(and(eq(reserva.token, token), eq(reserva.estado, "pendiente_pago"), isNull(reserva.numeroOperacion)))
        .returning({ id: reserva.id });
      if (fila) return { estado: "registrado" };
    } catch (error) {
      const { codigo, restriccion } = leerErrorPg(error);
      if (codigo === UNICO && restriccion === RESTRICCION_NUMERO) return { estado: "numero_usado" };
      throw error;
    }

    // No se actualizó nada: se lee la reserva para explicar por qué.
    const [actual] = await db
      .select({
        estado: reserva.estado,
        numeroOperacion: reserva.numeroOperacion,
        motivoCancelacion: reserva.motivoCancelacion,
      })
      .from(reserva)
      .where(eq(reserva.token, token));

    if (!actual) return { estado: "no_encontrada" };
    switch (actual.estado) {
      case "pendiente_validacion":
      case "confirmada":
        // Reenviar el mismo número (doble clic) no es un error.
        if (actual.numeroOperacion === numero) return { estado: "registrado" };
        return { estado: actual.estado === "confirmada" ? "ya_confirmada" : "pago_ya_informado" };
      case "cancelada":
        return { estado: actual.motivoCancelacion === "vencida" ? "vencida" : "cancelada" };
      case "pendiente_pago":
        // Otra transacción que la tocaba se deshizo entre el UPDATE y la lectura: se reintenta una vez.
        if (intento >= INTENTOS) throw new Error("La reserva sigue pendiente de pago pero no se pudo actualizar.");
        break;
    }
  }
}
