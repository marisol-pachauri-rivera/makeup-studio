import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { EstadoDeReserva } from "@/lib/reserva/estado";
import { PLAZO_VENCIMIENTO_MINUTOS } from "@/lib/reserva/vencimiento";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/cancelacion/formulario";
import { BotonCancelar } from "./boton-cancelar";
import { fechaLarga } from "./formato-fecha";
import { SeccionDePago, type DatosDePago } from "./seccion-de-pago";
import { TextoReembolso } from "./texto-reembolso";

type Estado = EstadoDeReserva["estado"];

const TEXTOS: Record<Estado, { etiqueta: string; variante: "default" | "secondary" | "outline" | "destructive"; explicacion: string }> = {
  pendiente_pago: {
    etiqueta: "Pendiente de pago",
    variante: "secondary",
    explicacion: "Tu horario está apartado. Falta completar el pago para confirmar la reserva.",
  },
  pendiente_validacion: {
    etiqueta: "Pendiente de validación",
    variante: "secondary",
    explicacion: "El studio está revisando tu pago. Volvé a esta página para ver si ya quedó confirmada.",
  },
  confirmada: {
    etiqueta: "Confirmada",
    variante: "default",
    explicacion: "Tu reserva está confirmada. Te esperamos.",
  },
  cancelada: {
    etiqueta: "Cancelada",
    variante: "destructive",
    explicacion: "Esta reserva fue cancelada.",
  },
};

export type DatosDeCancelacion = {
  /** El token del enlace: el formulario lo manda en un campo oculto. */
  token: string;
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;
  /** El instante de la consulta, para saber si el plazo ya pasó (se lee en el servidor). */
  ahora: Date;
};

/** Página de estado de una reserva (ADR 0004): solo lectura, sin teléfono ni datos de otras clientas. */
export function EstadoDeReservaVista({
  reserva,
  pago,
  cancelacion,
}: {
  reserva: EstadoDeReserva;
  pago?: DatosDePago;
  cancelacion?: DatosDeCancelacion;
}) {
  const texto = TEXTOS[reserva.estado];
  const venció = reserva.estado === "cancelada" && reserva.motivoCancelacion === "vencida";
  // Una reserva grupal tiene un turno por integrante, con un solo estado y un solo monto.
  const esGrupo = reserva.lineas.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="titulo-estado">
        <h2 id="titulo-estado" className="text-lg font-semibold">
          Estado de tu reserva
        </h2>
        <div>
          <Badge variant={texto.variante}>{texto.etiqueta}</Badge>
        </div>
        {venció ? (
          <div className="flex flex-col gap-2">
            <p>
              Tu reserva venció: pasaron {PLAZO_VENCIMIENTO_MINUTOS} minutos sin pago y otra clienta tomó el horario.
              Podés elegir otro horario.
            </p>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
              Elegir otro horario
            </Link>
          </div>
        ) : (
          <p>{texto.explicacion}</p>
        )}
      </section>

      {reserva.estado === "pendiente_pago" && pago && (
        <SeccionDePago
          datos={pago}
          montoTotal={reserva.montoTotal}
          plazoPagoHasta={reserva.plazoPagoHasta}
          motivoRechazo={reserva.motivoRechazo}
        />
      )}

      {reserva.estado === "cancelada" && reserva.motivoCancelacion === "clienta" && (
        <TextoReembolso estadoReembolso={reserva.estadoReembolso} montoTotal={reserva.montoTotal} />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="titulo-turnos">
        <h2 id="titulo-turnos" className="text-lg font-semibold">
          {esGrupo ? "Tus turnos" : "Tu turno"}
        </h2>
        <ul className="flex flex-col gap-3">
          {reserva.lineas.map((linea, indice) => {
            const { fecha, hora } = aPartesLocales(linea.inicio);
            const fin = aPartesLocales(linea.fin).hora;
            return (
              // La posición como clave: dos integrantes pueden llamarse igual y tener el mismo horario.
              <li key={indice} className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
                <p className="font-medium">{linea.servicio}</p>
                <p>
                  {linea.persona} · con {linea.maquilladora}
                </p>
                <p className="capitalize">{fechaLarga(fecha)}</p>
                <p>
                  {hora} a {fin} (hora de Lima)
                </p>
              </li>
            );
          })}
        </ul>
        <p>
          <span className="text-muted-foreground">{esGrupo ? "Monto total del grupo: " : "Monto total: "}</span>
          <span className="font-medium">{reserva.montoTotal}</span>
        </p>
      </section>

      {reserva.estado !== "cancelada" && cancelacion && reserva.puedeCancelarHasta && (
        <BotonCancelar
          token={cancelacion.token}
          accion={cancelacion.accion}
          puedeCancelarHasta={reserva.puedeCancelarHasta}
          ahora={cancelacion.ahora}
        />
      )}

      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        Guardá este enlace: es la única forma de volver a tu reserva y ver cómo avanza.
      </p>
    </div>
  );
}
