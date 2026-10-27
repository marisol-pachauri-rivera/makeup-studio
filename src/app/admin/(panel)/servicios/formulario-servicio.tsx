"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button, buttonVariants } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/catalogo/formularios";

export type ServicioEditable = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: string;
  duracionMinutos: number;
};

/** Alta y edición comparten formulario: con `servicio` edita, sin él crea. */
export function FormularioServicio({
  accion,
  servicio,
}: {
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  servicio?: ServicioEditable;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, {});
  // Tras un rechazo se repuebla con lo escrito; si no, con el servicio guardado.
  const valor = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const errores = estado.errores ?? {};

  return (
    <form action={enviar} className="flex w-full max-w-lg flex-col gap-4" noValidate>
      {servicio && <input type="hidden" name="id" value={servicio.id} />}

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
        defaultValue={valor("nombre", servicio?.nombre ?? "")}
        error={errores.nombre}
      />
      <CampoTexto
        id="descripcion"
        name="descripcion"
        etiqueta="Descripción (opcional)"
        multilinea
        maxLength={500}
        defaultValue={valor("descripcion", servicio?.descripcion ?? "")}
        error={errores.descripcion}
      />
      <CampoTexto
        id="precio"
        name="precio"
        etiqueta="Precio"
        inputMode="decimal"
        autoComplete="off"
        required
        ayuda="Con hasta dos decimales, por ejemplo 350 o 350,50."
        defaultValue={valor("precio", servicio?.precio ?? "")}
        error={errores.precio}
      />
      <CampoTexto
        id="duracionMinutos"
        name="duracionMinutos"
        etiqueta="Duración (minutos)"
        inputMode="numeric"
        autoComplete="off"
        required
        ayuda="Entre 1 y 720 minutos."
        defaultValue={valor("duracionMinutos", servicio ? String(servicio.duracionMinutos) : "")}
        error={errores.duracionMinutos}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : servicio ? "Guardar cambios" : "Crear servicio"}
        </Button>
        <Link href="/admin/servicios" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
