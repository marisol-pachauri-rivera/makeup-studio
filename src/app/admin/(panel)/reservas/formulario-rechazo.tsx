"use client";

import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { MAX_MOTIVO_RECHAZO } from "@/lib/reservas-panel/esquemas";
import { AvisoDeAccion } from "./aviso-de-accion";
import type { AccionDeReserva } from "./boton-validar";

/**
 * Rechazar el pago con un motivo obligatorio. El error va junto al campo y conserva lo escrito; la
 * clienta lo lee en su página de estado, junto al campo donde corrige el número.
 */
export function FormularioRechazo({ id, accion }: { id: number; accion: AccionDeReserva }) {
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });
  const invalido = estado.estado === "invalido" ? estado : undefined;

  return (
    <form action={enviar} className="flex w-full max-w-lg flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <AvisoDeAccion estado={estado} />
      <CampoTexto
        id="motivo"
        name="motivo"
        etiqueta="Motivo del rechazo"
        multilinea
        required
        maxLength={MAX_MOTIVO_RECHAZO}
        ayuda="La clienta lo ve en su página, junto al campo donde ingresa el número de nuevo."
        defaultValue={invalido?.valores.motivo ?? ""}
        error={invalido?.errores.motivo}
      />
      <div>
        <Button type="submit" variant="outline" disabled={pendiente}>
          {pendiente ? "Rechazando…" : "Rechazar pago"}
        </Button>
      </div>
    </form>
  );
}
