import { z } from "zod";
import { loginSchema } from "@/lib/auth/credenciales";
import { normalizarUsuario, type EstadoLimite } from "@/lib/auth/limite-intentos";
import { destinoTrasLogin } from "@/lib/auth/rutas";

export type EstadoLogin = {
  /** Se devuelve para no obligar a reescribirlo; la contraseña nunca vuelve. */
  usuario?: string;
  errores?: { usuario?: string; password?: string };
  mensaje?: string;
};

type Dependencias = {
  /** Ejecuta el inicio de sesión sin redirigir y devuelve la URL de retorno de Auth.js. */
  signIn: (credenciales: { usuario: string; password: string; redirectTo: string }) => Promise<string>;
  consultarLimite: (usuarioNormalizado: string) => Promise<EstadoLimite>;
  ahora?: () => Date;
};

export const MENSAJE_CREDENCIALES_INVALIDAS = "Usuario o contraseña incorrectos.";

export function mensajeDeBloqueo(estado: EstadoLimite, ahora: Date): string {
  const minutos = estado.bloqueado
    ? Math.max(1, Math.ceil((estado.reintentarEn.getTime() - ahora.getTime()) / 60_000))
    : 15;
  return `Demasiados intentos fallidos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}

/**
 * Lógica del formulario de login. Valida antes de tocar la base; no distingue usuario inexistente
 * de contraseña incorrecta y deja el aviso de espera al límite de intentos.
 */
export async function procesarInicioSesion(
  entrada: { usuario: unknown; password: unknown; callbackUrl: unknown },
  deps: Dependencias,
): Promise<EstadoLogin | { redirigirA: string }> {
  const usuarioEscrito = typeof entrada.usuario === "string" ? entrada.usuario : "";

  const datos = loginSchema.safeParse({ usuario: entrada.usuario, password: entrada.password });
  if (!datos.success) {
    const { fieldErrors } = z.flattenError(datos.error);
    return {
      usuario: usuarioEscrito,
      errores: { usuario: fieldErrors.usuario?.[0], password: fieldErrors.password?.[0] },
    };
  }

  const destino = destinoTrasLogin(typeof entrada.callbackUrl === "string" ? entrada.callbackUrl : null);
  const retorno = await deps.signIn({
    usuario: datos.data.usuario,
    password: datos.data.password,
    redirectTo: destino,
  });
  const parametros = new URL(retorno, "http://panel.local").searchParams;

  if (!parametros.get("error")) return { redirigirA: destino };

  if (parametros.get("code") === "bloqueado") {
    const estado = await deps.consultarLimite(normalizarUsuario(datos.data.usuario));
    return { usuario: usuarioEscrito, mensaje: mensajeDeBloqueo(estado, (deps.ahora ?? (() => new Date()))()) };
  }
  return { usuario: usuarioEscrito, mensaje: MENSAJE_CREDENCIALES_INVALIDAS };
}
