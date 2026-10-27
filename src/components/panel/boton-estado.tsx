"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Enviar({ activo, registro }: { activo: boolean; registro: string }) {
  const { pending } = useFormStatus();
  const accion = activo ? "Desactivar" : "Activar";
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`${accion} ${registro}`}>
      {accion}
    </Button>
  );
}

/**
 * Botón de activar o desactivar. Manda el estado destino (no un alternar), así que un doble clic
 * da el mismo resultado. No hay botón de borrado: la baja es siempre desactivar.
 */
export function BotonEstado({
  accion,
  id,
  activo,
  registro,
}: {
  accion: (formData: FormData) => Promise<void>;
  id: number;
  /** Estado actual: el botón pide el contrario. */
  activo: boolean;
  /** Nombre del registro, para el nombre accesible del botón. */
  registro: string;
}) {
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={String(!activo)} />
      <Enviar activo={activo} registro={registro} />
    </form>
  );
}
