import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { ConfiguracionDePago } from "@/lib/pago/configuracion";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/pago/formulario";
import { PLAZO_VENCIMIENTO_MINUTOS } from "@/lib/reserva/vencimiento";
import { FormularioNumero } from "./formulario-numero";

export type DatosDePago = {
  /** El token del enlace: el formulario lo manda en un campo oculto. */
  token: string;
  /** `null` si el studio todavía no configuró su QR. */
  configuracion: ConfiguracionDePago | null;
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;
  /** El instante de la consulta, para saber si el plazo ya pasó (se lee en el servidor, sin cuenta regresiva). */
  ahora: Date;
};

/**
 * Cómo pagar una reserva pendiente de pago: QR de la billetera, monto exacto, plazo y el campo del número.
 * Sin QR configurado lo dice y no ofrece el campo: nadie debe pagar sin saber a dónde ni informar un pago
 * que no hizo.
 */
export function SeccionDePago({
  datos,
  montoTotal,
  plazoPagoHasta,
  motivoRechazo = null,
}: {
  datos: DatosDePago;
  montoTotal: string;
  /** `null` si la reserva no puede vencer (por ejemplo, volvió a pendiente de pago por un rechazo). */
  plazoPagoHasta: Date | null;
  /** Lo que el studio escribió al rechazar el pago; `null` si nunca lo rechazó. */
  motivoRechazo?: string | null;
}) {
  const { configuracion, token, accion, ahora } = datos;

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4" aria-labelledby="titulo-pago">
      <h2 id="titulo-pago" className="text-lg font-semibold">
        Pagá tu reserva
      </h2>

      {!configuracion ? (
        <>
          {motivoRechazo !== null && <AvisoDeRechazo motivo={motivoRechazo} />}
          <p className="text-muted-foreground">
            El pago por QR todavía no está disponible. Volvé a abrir este enlace en un rato.
          </p>
        </>
      ) : (
        <>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>Escaneá el QR con {configuracion.billetera}.</li>
            <li>
              Pagá el monto exacto: <span className="font-semibold">{montoTotal}</span>.
            </li>
            <li>Copiá el número de operación del comprobante y escribilo abajo.</li>
          </ol>

          {/* Un QR no debe pasar por el optimizador de imágenes (degradaría los módulos): `<img>` común. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={configuracion.qrUrl}
            alt={`Código QR para pagar con ${configuracion.billetera}`}
            width={224}
            height={224}
            className="h-56 w-56 rounded-lg border bg-white p-2"
          />

          {plazoPagoHasta && <PlazoDePago hasta={plazoPagoHasta} ahora={ahora} />}

          {motivoRechazo !== null && <AvisoDeRechazo motivo={motivoRechazo} />}

          <FormularioNumero token={token} accion={accion} />
        </>
      )}
    </section>
  );
}

/** El motivo es texto libre de la administradora: se renderiza como texto (React lo escapa), nunca como HTML. */
function AvisoDeRechazo({ motivo }: { motivo: string }) {
  return (
    <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      El studio no pudo validar tu pago: {motivo}. Ingresá el número de nuevo.
    </p>
  );
}

function PlazoDePago({ hasta, ahora }: { hasta: Date; ahora: Date }) {
  const hora = aPartesLocales(hasta).hora;

  if (ahora.getTime() <= hasta.getTime()) {
    return (
      <p className="text-sm">
        Tenés {PLAZO_VENCIMIENTO_MINUTOS} minutos desde que reservaste para pagar: hasta las{" "}
        <span className="font-semibold">{hora}</span> (hora de Lima). Pasado ese plazo, otra clienta puede tomar tu horario.
      </p>
    );
  }
  return (
    <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      El plazo de {PLAZO_VENCIMIENTO_MINUTOS} minutos ya pasó (era hasta las {hora}, hora de Lima). Tu horario podría
      haberse liberado; si nadie lo tomó todavía, podés ingresar tu número igual.
    </p>
  );
}
