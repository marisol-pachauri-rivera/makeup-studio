"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import { PLAZO_CANCELACION_HORAS } from "@/lib/cancelacion/plazo";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/cancelacion/formulario";
import { fechaLarga } from "./formato-fecha";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;

const alerta = "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/**
 * Cancelar la reserva completa desde el enlace. Muestra hasta cuándo se puede (hora de Lima) y, pasado
 * ese plazo, deshabilita el botón y dice que escriba al studio. La pantalla solo anticipa la regla: la
 * decide el servidor. Cancelar no se puede deshacer, así que pide confirmar en un segundo paso.
 */
export function BotonCancelar({
  token,
  accion,
  puedeCancelarHasta,
  ahora,
}: {
  token: string;
  accion: Accion;
  puedeCancelarHasta: Date;
  /** El instante de la consulta, leído en el servidor. */
  ahora: Date;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });

  const { fecha, hora } = aPartesLocales(puedeCancelarHasta);
  const enPlazo = ahora.getTime() <= puedeCancelarHasta.getTime();
  const aviso = resultado.estado === "rechazada" ? resultado.mensaje : null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-cancelar">
      <h2 id="titulo-cancelar" className="text-lg font-semibold">
        Cancelar la reserva
      </h2>

      {enPlazo ? (
        <p className="text-sm">
          Podés cancelar hasta el <span className="capitalize">{fechaLarga(fecha)}</span> a las{" "}
          <span className="font-semibold">{hora}</span> (hora de Lima): {PLAZO_CANCELACION_HORAS} horas antes de tu
          primer turno.
        </p>
      ) : (
        <p role="status" className="text-sm">
          Ya no se puede cancelar desde acá: faltan menos de {PLAZO_CANCELACION_HORAS} horas para tu turno. Escribile al
          studio.
        </p>
      )}

      {aviso && (
        <p role="alert" className={alerta}>
          {aviso}
        </p>
      )}

      {!confirmando || !enPlazo ? (
        <div>
          <Button type="button" variant="destructive" disabled={!enPlazo} onClick={() => setConfirmando(true)}>
            Cancelar reserva
          </Button>
        </div>
      ) : (
        <form action={enviar} className="flex max-w-lg flex-col gap-3 rounded-lg border border-destructive/40 p-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm">
            Vas a cancelar toda la reserva y tu horario va a quedar libre. No se puede deshacer.
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pendiente}>
              {pendiente ? "Cancelando…" : "Sí, cancelar mi reserva"}
            </Button>
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => setConfirmando(false)}>
              Volver
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
