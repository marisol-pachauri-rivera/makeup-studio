"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { almacenDeSesion, elegirParaIntegrante, iniciarSeleccion, type Seleccion } from "@/lib/reserva/asistente";

/**
 * Un horario libre que la clienta puede elegir. Elegirlo solo guarda la selección en el cliente
 * (ADR 0008) y lleva al paso de confirmación: no reserva ni bloquea nada hasta que ella confirma.
 */
export function HorarioElegible({
  servicio,
  maquilladora,
  inicio,
  hora,
}: Seleccion & {
  /** Hora local `HH:mm` para mostrar. */
  hora: string;
}) {
  const router = useRouter();

  function elegir() {
    const almacen = almacenDeSesion();
    if (almacen) {
      const seleccion = { servicio, maquilladora, inicio };
      // Con una integrante en edición el horario es suyo y no toca a las demás ni a quien reserva;
      // sin ninguna, es la reserva individual de siempre.
      if (!elegirParaIntegrante(almacen, seleccion)) iniciarSeleccion(almacen, seleccion);
    }
    router.push("/reservar");
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={elegir}
      aria-label={`Elegir el horario de las ${hora}`}
    >
      {hora}
    </Button>
  );
}
