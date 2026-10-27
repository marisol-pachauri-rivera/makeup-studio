"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getDb } from "@/db";
import { consultarLimite } from "@/lib/auth/limite-intentos";
import { procesarInicioSesion, type EstadoLogin } from "./iniciar-sesion";

/** Única Server Action del panel que no exige sesión: es la que la crea. */
export async function iniciarSesion(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const resultado = await procesarInicioSesion(
    {
      usuario: formData.get("usuario"),
      password: formData.get("password"),
      callbackUrl: formData.get("callbackUrl"),
    },
    {
      signIn: (credenciales) => signIn("credentials", { ...credenciales, redirect: false }),
      consultarLimite: (usuario) => consultarLimite(getDb(), usuario),
    },
  );
  if ("redirigirA" in resultado) redirect(resultado.redirigirA);
  return resultado;
}
