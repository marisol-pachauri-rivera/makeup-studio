"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { AvisoDeAccion } from "../reservas/aviso-de-accion";
import type { AccionDeReserva } from "../reservas/boton-validar";

/** Manda el id de la reserva; el servidor decide si el reembolso sigue pendiente (repetirlo no hace daño). */
export function BotonMarcarRealizado({
  id,
  accion,
  registro,
}: {
  id: number;
  accion: AccionDeReserva;
  /** Nombre de la clienta, para el nombre accesible del botón. */
  registro: string;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });

  return (
    <form action={enviar} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <AvisoDeAccion estado={estado} />
      <Button type="submit" variant="outline" size="sm" disabled={pendiente} aria-label={`Marcar como realizado el reembolso de ${registro}`}>
        {pendiente ? "Marcando…" : "Marcar como realizado"}
      </Button>
    </form>
  );
}
