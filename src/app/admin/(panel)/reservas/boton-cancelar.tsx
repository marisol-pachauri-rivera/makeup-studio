"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { AvisoDeAccion } from "./aviso-de-accion";
import type { AccionDeReserva } from "./boton-validar";

/**
 * Cancelar no se puede deshacer: el primer botón solo despliega el aviso y la cancelación se envía con
 * "Confirmar cancelación", que manda `confirmar=true`. El servidor también exige esa marca.
 */
export function BotonCancelar({
  id,
  accion,
  confirmada,
}: {
  id: number;
  accion: AccionDeReserva;
  /** Una reserva confirmada ya tiene pago validado: cancelarla deja un reembolso pendiente. */
  confirmada: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });

  if (!confirmando) {
    return (
      <div className="flex flex-col gap-2">
        <AvisoDeAccion estado={estado} />
        <div>
          <Button type="button" variant="destructive" onClick={() => setConfirmando(true)}>
            Cancelar reserva
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-3 rounded-lg border border-destructive/40 p-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="confirmar" value="true" />
      <p role="alert" className="text-sm">
        Vas a cancelar esta reserva. El horario queda libre para otras clientas y no se puede deshacer.
        {confirmada && " Como el pago ya estaba validado, el reembolso queda pendiente."}
      </p>
      <AvisoDeAccion estado={estado} />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pendiente}>
          {pendiente ? "Cancelando…" : "Confirmar cancelación"}
        </Button>
        <Button type="button" variant="outline" disabled={pendiente} onClick={() => setConfirmando(false)}>
          Volver
        </Button>
      </div>
    </form>
  );
}
