import { BotonCancelar } from "./boton-cancelar";
import { BotonValidar, type AccionDeReserva } from "./boton-validar";
import { FormularioRechazo } from "./formulario-rechazo";

type Estado = "pendiente_pago" | "pendiente_validacion" | "confirmada" | "cancelada";

/**
 * Solo las acciones que el estado permite: validar y rechazar en `pendiente_validacion`, cancelar en los
 * tres estados vivos y nada en `cancelada`. El servidor vuelve a comprobar el estado en cada acción.
 */
export function AccionesDeReserva({
  reserva,
  validar,
  rechazar,
  cancelar,
}: {
  reserva: { id: number; estado: Estado };
  validar: AccionDeReserva;
  rechazar: AccionDeReserva;
  cancelar: AccionDeReserva;
}) {
  if (reserva.estado === "cancelada") {
    return <p className="text-sm text-muted-foreground">Esta reserva está cancelada: no hay acciones disponibles.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {reserva.estado === "pendiente_validacion" && (
        <>
          <section className="flex flex-col gap-2" aria-labelledby="titulo-validar">
            <h3 id="titulo-validar" className="font-medium">
              Validar el pago
            </h3>
            <p className="text-sm text-muted-foreground">
              Cotejá el número de operación con tu billetera y, si coincide, confirmá la reserva.
            </p>
            <BotonValidar id={reserva.id} accion={validar} />
          </section>
          <section className="flex flex-col gap-2" aria-labelledby="titulo-rechazar">
            <h3 id="titulo-rechazar" className="font-medium">
              Rechazar el pago
            </h3>
            <p className="text-sm text-muted-foreground">
              La reserva vuelve a pendiente de pago y conserva su horario. La clienta puede ingresar otro número.
            </p>
            <FormularioRechazo id={reserva.id} accion={rechazar} />
          </section>
        </>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="titulo-cancelar">
        <h3 id="titulo-cancelar" className="font-medium">
          Cancelar la reserva
        </h3>
        <BotonCancelar id={reserva.id} accion={cancelar} confirmada={reserva.estado === "confirmada"} />
      </section>
    </div>
  );
}
