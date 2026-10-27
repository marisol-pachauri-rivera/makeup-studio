"use client";

import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button } from "@/components/ui/button";
import { MAX_MOTIVO } from "@/lib/agenda/esquemas";
import type { EstadoAgenda } from "@/lib/agenda/formularios";

export function FormularioBloqueo({
  accion,
  maquilladoraId,
}: {
  accion: (estado: EstadoAgenda, formData: FormData) => Promise<EstadoAgenda>;
  maquilladoraId: number;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoAgenda, FormData>(accion, {});

  return (
    <form action={enviar} className="flex w-full max-w-lg flex-col gap-4" noValidate>
      <input type="hidden" name="maquilladoraId" value={maquilladoraId} />

      {estado.mensaje && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.mensaje}
        </p>
      )}
      {estado.exito && (
        <p role="status" className="text-sm text-muted-foreground">
          {estado.exito}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="inicio"
          name="inicio"
          etiqueta="Desde"
          type="datetime-local"
          required
          defaultValue={estado.valores?.inicio ?? ""}
          error={estado.errores?.inicio}
        />
        <CampoTexto
          id="fin"
          name="fin"
          etiqueta="Hasta"
          type="datetime-local"
          required
          defaultValue={estado.valores?.fin ?? ""}
          error={estado.errores?.fin}
        />
      </div>

      <CampoTexto
        id="motivo"
        name="motivo"
        etiqueta="Motivo"
        maxLength={MAX_MOTIVO}
        required
        ayuda="Hora de Lima. Por ejemplo: vacaciones, capacitación, feriado."
        defaultValue={estado.valores?.motivo ?? ""}
        error={estado.errores?.motivo}
      />

      <div>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Agregar bloqueo"}
        </Button>
      </div>
    </form>
  );
}
