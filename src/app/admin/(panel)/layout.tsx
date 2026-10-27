import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/panel/navegacion";
import { Button } from "@/components/ui/button";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { cerrarSesion } from "./actions";

export const metadata: Metadata = {
  title: "Panel | Studio de Maquillaje",
  robots: { index: false, follow: false },
};

/**
 * La sesión se lee en tiempo de petición, así que va detrás de Suspense (cacheComponents).
 * Este guardia no basta por sí solo: un layout no se vuelve a ejecutar al navegar entre páginas,
 * por eso cada página y cada Server Action del panel verifican la sesión por su cuenta.
 */
async function ConSesion({ children }: { children: ReactNode }) {
  const admin = await requerirAdminOLogin();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-semibold">
            Panel del studio
          </Link>
          <NavegacionPanel />
        </div>
        <form action={cerrarSesion} className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{admin.usuario}</span>
          <Button type="submit" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </header>
      {children}
    </>
  );
}

export default function LayoutPanel({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Cargando…</p>}>
      <ConSesion>{children}</ConSesion>
    </Suspense>
  );
}
