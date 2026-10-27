"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iniciarSesion } from "./actions";
import type { EstadoLogin } from "./iniciar-sesion";

export function FormularioLogin({ callbackUrl }: { callbackUrl: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {estado.mensaje && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.mensaje}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="usuario">Usuario</Label>
        <Input
          id="usuario"
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          defaultValue={estado.usuario ?? ""}
          aria-invalid={estado.errores?.usuario ? true : undefined}
          aria-describedby={estado.errores?.usuario ? "usuario-error" : undefined}
        />
        {estado.errores?.usuario && (
          <p id="usuario-error" className="text-sm text-destructive">
            {estado.errores.usuario}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={estado.errores?.password ? true : undefined}
          aria-describedby={estado.errores?.password ? "password-error" : undefined}
        />
        {estado.errores?.password && (
          <p id="password-error" className="text-sm text-destructive">
            {estado.errores.password}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pendiente}>
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
