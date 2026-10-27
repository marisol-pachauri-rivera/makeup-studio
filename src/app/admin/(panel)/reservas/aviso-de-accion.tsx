import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";

/** Aviso de una acción que no se aplicó (la reserva cambió, ya estaba aplicada o no existe). */
export function AvisoDeAccion({ estado }: { estado: EstadoFormulario }) {
  if (estado.estado !== "aviso") return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {estado.mensaje}
    </p>
  );
}
