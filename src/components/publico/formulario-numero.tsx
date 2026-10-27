"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button, buttonVariants } from "@/components/ui/button";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/pago/formulario";
import { MAX_NUMERO_OPERACION } from "@/lib/pago/esquemas";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;

const alerta = "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/**
 * Formulario del número de operación. Los errores del campo (vacío, formato, número ya usado) van junto
 * al campo y conservan lo escrito; si la reserva ya no admite el pago (venció, se canceló, ya se informó)
 * se explica con un aviso y se quita el campo, porque no hay nada más que enviar.
 */
export function FormularioNumero({ token, accion }: { token: string; accion: Accion }) {
  const [resultado, enviar, pendiente] = useActionState<EstadoFormulario, FormData>(accion, { estado: "inicial" });

  if (resultado.estado === "rechazado") {
    return (
      <div role="alert" className={`${alerta} flex flex-col gap-2`}>
        <p>{resultado.mensaje}</p>
        {resultado.motivo === "vencida" && (
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
            Elegir otro horario
          </Link>
        )}
      </div>
    );
  }

  const errores = resultado.estado === "invalido" ? resultado.errores : {};
  const valores = resultado.estado === "invalido" ? resultado.valores : {};
  const informado = resultado.estado === "registrado";

  return (
    <form action={enviar} className="flex w-full max-w-lg flex-col gap-3" noValidate>
      <input type="hidden" name="token" value={token} />
      <CampoTexto
        id="numero"
        name="numero"
        etiqueta="Número de operación"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={MAX_NUMERO_OPERACION + 10}
        required
        ayuda="Lo encontrás en el comprobante de tu billetera, después de pagar."
        defaultValue={valores.numero ?? ""}
        error={errores.numero}
      />
      {informado && (
        <p role="status" className="text-sm text-muted-foreground">
          Recibimos tu número de operación. El studio va a revisar tu pago.
        </p>
      )}
      <div>
        <Button type="submit" disabled={pendiente || informado}>
          {pendiente ? "Enviando…" : "Ya pagué: enviar mi número"}
        </Button>
      </div>
    </form>
  );
}
