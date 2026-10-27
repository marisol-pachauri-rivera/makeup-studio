"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { AvisoDeAccion } from "./aviso-de-accion";

export type AccionDeReserva = (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/** Validar el pago es un clic: el servidor decide si la reserva sigue en validación (repetirlo no hace daño). */
export function BotonValidar({ id, accion }: { id: number; accion: AccionDeReserva }) {
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });

  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <AvisoDeAccion estado={estado} />
      <div>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Validando…" : "Validar pago"}
        </Button>
      </div>
    </form>
  );
}
