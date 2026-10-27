import { Suspense } from "react";
import { AccesosDelPanel } from "@/components/panel/navegacion";
import { requerirAdminOLogin } from "@/lib/auth/sesion";

async function Bienvenida() {
  const admin = await requerirAdminOLogin();

  return (
    <>
      <h1 className="text-2xl font-semibold">Hola, {admin.usuario}</h1>
      <p className="max-w-md text-muted-foreground">
        Desde acá vas a gestionar reservas, pagos y agenda. Las secciones se irán sumando.
      </p>
      <AccesosDelPanel />
    </>
  );
}

export default function PaginaPanel() {
  return (
    <main className="flex flex-1 flex-col gap-3 p-6">
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Bienvenida />
      </Suspense>
    </main>
  );
}
