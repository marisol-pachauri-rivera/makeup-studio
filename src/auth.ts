import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/db";
import { DURACION_SESION_SEGUNDOS, leerAuthSecret } from "@/lib/auth/config";
import { autorizar } from "@/lib/auth/credenciales";

/** El login lee este `code` de la URL de retorno para mostrar el aviso de espera. */
export class LoginBloqueado extends CredentialsSignin {
  code = "bloqueado";
}

// Configuración perezosa: leer AUTH_SECRET al importar rompería `next build` sin entorno.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: leerAuthSecret(),
  session: { strategy: "jwt", maxAge: DURACION_SESION_SEGUNDOS, updateAge: DURACION_SESION_SEGUNDOS },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { usuario: {}, password: {} },
      async authorize(credenciales) {
        const resultado = await autorizar(getDb(), credenciales);
        if (resultado.ok) return { id: resultado.admin.id, name: resultado.admin.usuario };
        if (resultado.motivo === "bloqueado") throw new LoginBloqueado();
        return null;
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
}));
