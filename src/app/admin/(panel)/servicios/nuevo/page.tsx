import { Suspense } from "react";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { crearServicio } from "../actions";
import { FormularioServicio } from "../formulario-servicio";

export const metadata = { title: "Nuevo servicio | Panel | Studio de Maquillaje" };

async function Contenido() {
  await requerirAdminOLogin();
  return <FormularioServicio accion={crearServicio} />;
}

export default function PaginaNuevoServicio() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nuevo servicio</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </main>
  );
}
