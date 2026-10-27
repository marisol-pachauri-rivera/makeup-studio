import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reservaLinea } from "@/db/schema";
import { esChoqueDeHorario } from "@/lib/reserva/errores-pg";
import { liberarVencidasEnConflicto, MAX_REINTENTOS_DE_LIBERACION } from "@/lib/reserva/vencimiento";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests). Aquí `Db` es, en la práctica,
// el cliente de una transacción: todo se ejecuta en serie (pg no admite consultas simultáneas en uno).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type CambioDeLinea = {
  lineaId: number;
  /** Horario y maquilladora que la clienta vio: el `UPDATE` solo aplica si el turno sigue así. */
  inicioVisto: Date;
  maquilladoraVistaId: number;
  destino: { maquilladoraId: number; inicio: Date; fin: Date };
};

export type ResultadoActualizacion =
  /** El turno se movió con esta llamada. */
  | "actualizada"
  /** El turno ya estaba en el destino pedido (doble clic): no cambió nada. */
  | "repetida"
  /** Algo vigente ocupa el destino. Quien llama debe deshacer la transacción completa. */
  | "ocupado"
  /** El turno ya no está donde la clienta lo vio (otra pestaña lo movió, o dejó de estar activo). */
  | "turno_cambiado";

/**
 * Mueve una línea a otro horario o maquilladora liberando reservas vencidas, análoga a
 * `insertarLineaLiberandoVencidas` pero con `UPDATE` (ADR 0003).
 *
 * El `UPDATE` está condicionado al horario y a la maquilladora vistos y a que la línea siga activa. Cada
 * intento corre en un savepoint: tras un error Postgres aborta la transacción entera y el savepoint deja
 * la externa usable. Si choca con la exclusión de horario y lo que ocupa es una reserva vencida, la
 * cancela y reintenta aquí mismo; la propia línea no cuenta como bloqueante (`excluirLineaId`). Devuelve
 * `"ocupado"` cuando algo vigente sigue ocupando: quien llama deshace la transacción completa, así no queda
 * cancelada ninguna vencida sin que el movimiento ocurra. Los errores que no son un choque se relanzan.
 */
export async function actualizarLineaLiberandoVencidas(
  tx: Db,
  { lineaId, inicioVisto, maquilladoraVistaId, destino }: CambioDeLinea,
  ahora: Date,
): Promise<ResultadoActualizacion> {
  for (let intento = 0; ; intento++) {
    try {
      const movida = await tx.transaction(async (sp) => {
        const filas = await sp
          .update(reservaLinea)
          .set({ maquilladoraId: destino.maquilladoraId, inicio: destino.inicio, fin: destino.fin })
          .where(
            and(
              eq(reservaLinea.id, lineaId),
              eq(reservaLinea.activa, true),
              eq(reservaLinea.inicio, inicioVisto),
              eq(reservaLinea.maquilladoraId, maquilladoraVistaId),
            ),
          )
          .returning({ id: reservaLinea.id });
        return filas.length > 0;
      });
      if (movida) return "actualizada";
      return await explicarSinCambio(tx, lineaId, destino);
    } catch (error) {
      if (!esChoqueDeHorario(error)) throw error;
      if (intento >= MAX_REINTENTOS_DE_LIBERACION) return "ocupado";

      const { canceladas, bloqueantes } = await liberarVencidasEnConflicto(
        tx,
        { maquilladoraId: destino.maquilladoraId, inicio: destino.inicio, fin: destino.fin, excluirLineaId: lineaId },
        ahora,
      );
      // Nada que liberar, o algo vigente sigue ocupando: no hay reintento (ADR 0003).
      if (bloqueantes > 0 || canceladas.length === 0) return "ocupado";
    }
  }
}

/** El `UPDATE` no afectó filas: ya está en el destino (doble clic) o el turno cambió por otra vía. */
async function explicarSinCambio(
  tx: Db,
  lineaId: number,
  destino: CambioDeLinea["destino"],
): Promise<"repetida" | "turno_cambiado"> {
  const [actual] = await tx
    .select({ activa: reservaLinea.activa, inicio: reservaLinea.inicio, maquilladoraId: reservaLinea.maquilladoraId })
    .from(reservaLinea)
    .where(eq(reservaLinea.id, lineaId));
  const yaEnDestino =
    actual?.activa === true &&
    actual.maquilladoraId === destino.maquilladoraId &&
    actual.inicio.getTime() === destino.inicio.getTime();
  return yaEnDestino ? "repetida" : "turno_cambiado";
}
