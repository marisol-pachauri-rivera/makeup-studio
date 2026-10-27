"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Enviar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={etiqueta}>
      Quitar
    </Button>
  );
}

/** Baja de un tramo o un bloqueo. Es un borrado real: nada más referencia estas filas. */
export function BotonQuitar({
  accion,
  maquilladoraId,
  id,
  etiqueta,
}: {
  accion: (formData: FormData) => Promise<void>;
  maquilladoraId: number;
  id: number;
  /** Nombre accesible del botón, para distinguir una fila de otra. */
  etiqueta: string;
}) {
  return (
    <form action={accion}>
      <input type="hidden" name="maquilladoraId" value={maquilladoraId} />
      <input type="hidden" name="id" value={id} />
      <Enviar etiqueta={etiqueta} />
    </form>
  );
}
