import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { destinoTrasLogin } from "@/lib/auth/rutas";
import { obtenerAdmin } from "@/lib/auth/sesion";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = {
  title: "Ingresar al panel | Studio de Maquillaje",
  robots: { index: false, follow: false },
};

async function Contenido({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const { callbackUrl } = await searchParams;
  const destino = destinoTrasLogin(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);

  // Con sesión válida el login no tiene sentido. Se decide acá y no en el proxy: una cookie
  // vencida parece sesión para el proxy y provocaría un bucle de redirecciones.
  if (await obtenerAdmin()) redirect(destino);

  return <FormularioLogin callbackUrl={destino} />;
}

export default function PaginaLogin({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Panel del studio</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
