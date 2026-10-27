"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/reprogramacion/formulario";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;

const alerta = "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

export type DatosDelCambio = {
  token: string;
  lineaId: number;
  /** Nueva maquilladora y nuevo inicio (ISO). */
  maquilladoraId: number;
  inicio: string;
  /** Lo que la clienta vio del turno (ISO y maquilladora): el servidor solo aplica si sigue así. */
  inicioVisto: string;
  maquilladoraVistaId: number;
};

/**
 * Confirmar la reprogramación. Manda todo lo necesario en campos ocultos; el servidor valida y decide.
 * Si el horario ya no está disponible, muestra el aviso, conserva maquilladora y día (la selección vive en
 * la URL) y ofrece volver a ver los horarios; el turno original sigue intacto. Al éxito la acción redirige
 * a la página de estado.
 */
export function FormularioReprogramacion({
  accion,
  cambio,
  volverA,
}: {
  accion: Accion;
  cambio: DatosDelCambio;
  /** Los horarios de la misma maquilladora y día, sin el horario elegido. */
  volverA: string;
}) {
  const [resultado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });
  const rechazo = resultado.estado === "rechazada" ? resultado : null;

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-3">
      <input type="hidden" name="token" value={cambio.token} />
      <input type="hidden" name="lineaId" value={cambio.lineaId} />
      <input type="hidden" name="maquilladoraId" value={cambio.maquilladoraId} />
      <input type="hidden" name="inicio" value={cambio.inicio} />
      <input type="hidden" name="inicioVisto" value={cambio.inicioVisto} />
      <input type="hidden" name="maquilladoraVistaId" value={cambio.maquilladoraVistaId} />

      {rechazo && (
        <div role="alert" className={`${alerta} flex flex-col gap-2`}>
          <p>{rechazo.mensaje}</p>
          {rechazo.motivo === "horario_no_disponible" && (
            <Link href={volverA} className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
              Ver los horarios de nuevo
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Confirmando…" : "Confirmar el cambio"}
        </Button>
        <Link href={`/reservas/${cambio.token}`} className={buttonVariants({ variant: "outline" })}>
          No cambiar
        </Link>
      </div>
    </form>
  );
}
