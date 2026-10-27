import type { EstadoDeReserva } from "@/lib/reserva/estado";

/**
 * Qué pasa con el pago de una reserva que la clienta canceló: monto, que el studio gestiona la
 * devolución y en qué punto está. No promete plazos ni un medio de devolución: el sistema no los controla.
 */
export function TextoReembolso({
  estadoReembolso,
  montoTotal,
}: {
  estadoReembolso: EstadoDeReserva["estadoReembolso"];
  montoTotal: string;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm" aria-labelledby="titulo-reembolso">
      <h3 id="titulo-reembolso" className="font-medium">
        Reembolso
      </h3>
      {estadoReembolso === "pendiente" && (
        <p>
          El studio gestiona la devolución de <span className="font-semibold">{montoTotal}</span>. Todavía está
          pendiente.
        </p>
      )}
      {estadoReembolso === "realizado" && (
        <p>
          El studio ya realizó la devolución de <span className="font-semibold">{montoTotal}</span>.
        </p>
      )}
      {estadoReembolso === "no_aplica" && (
        <p>No hay pago que devolver: cancelaste la reserva antes de informar un pago.</p>
      )}
    </section>
  );
}
