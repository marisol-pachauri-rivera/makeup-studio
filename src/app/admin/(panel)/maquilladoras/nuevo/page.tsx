import { Suspense } from "react";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { crearMaquilladora } from "../actions";
import { FormularioMaquilladora } from "../formulario-maquilladora";

export const metadata = { title: "Nueva maquilladora | Panel | Studio de Maquillaje" };

async function Contenido() {
  await requerirAdminOLogin();
  return <FormularioMaquilladora accion={crearMaquilladora} />;
}

export default function PaginaNuevaMaquilladora() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nueva maquilladora</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </main>
  );
}
