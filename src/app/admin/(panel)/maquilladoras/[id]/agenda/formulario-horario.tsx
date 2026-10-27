"use client";

import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NOMBRE_DIA, ORDEN_DIAS } from "@/lib/agenda/dias";
import type { EstadoAgenda } from "@/lib/agenda/formularios";

const CLASE_SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

export function FormularioHorario({
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="diaSemana">Día</Label>
        {/* React no reaplica `defaultValue` a un select ya montado: la `key` lo remonta con el valor devuelto. */}
        <select
          key={estado.valores?.diaSemana ?? "inicial"}
          id="diaSemana"
          name="diaSemana"
          className={CLASE_SELECT}
          defaultValue={estado.valores?.diaSemana ?? "1"}
          aria-invalid={estado.errores?.diaSemana ? true : undefined}
          aria-describedby={estado.errores?.diaSemana ? "diaSemana-error" : undefined}
        >
          {ORDEN_DIAS.map((dia) => (
            <option key={dia} value={dia}>
              {NOMBRE_DIA[dia]}
            </option>
          ))}
        </select>
        {estado.errores?.diaSemana && (
          <p id="diaSemana-error" className="text-sm text-destructive">
            {estado.errores.diaSemana}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CampoTexto
          id="horaInicio"
          name="horaInicio"
          etiqueta="Desde"
          type="time"
          required
          defaultValue={estado.valores?.horaInicio ?? ""}
          error={estado.errores?.horaInicio}
        />
        <CampoTexto
          id="horaFin"
          name="horaFin"
          etiqueta="Hasta"
          type="time"
          required
          defaultValue={estado.valores?.horaFin ?? ""}
          error={estado.errores?.horaFin}
        />
      </div>

      <div>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Agregar tramo"}
        </Button>
      </div>
    </form>
  );
}
