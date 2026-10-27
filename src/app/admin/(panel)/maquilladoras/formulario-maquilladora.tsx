"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button, buttonVariants } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/catalogo/formularios";

export type MaquilladoraEditable = { id: number; nombre: string };

/** Alta y edición comparten formulario: con `maquilladora` edita, sin ella crea. */
export function FormularioMaquilladora({
  accion,
  maquilladora,
}: {
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  maquilladora?: MaquilladoraEditable;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, {});

  return (
    <form action={enviar} className="flex w-full max-w-lg flex-col gap-4" noValidate>
      {maquilladora && <input type="hidden" name="id" value={maquilladora.id} />}

      {estado.mensaje && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.mensaje}
        </p>
      )}

      <CampoTexto
        id="nombre"
        name="nombre"
        etiqueta="Nombre"
        maxLength={100}
        required
        defaultValue={estado.valores?.nombre ?? maquilladora?.nombre ?? ""}
        error={estado.errores?.nombre}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : maquilladora ? "Guardar cambios" : "Crear maquilladora"}
        </Button>
        <Link href="/admin/maquilladoras" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
