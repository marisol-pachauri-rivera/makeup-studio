import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { idSchema } from "@/lib/catalogo/esquemas";
import { obtenerServicio } from "@/lib/catalogo/servicios";
import { actualizarServicio } from "../actions";
import { FormularioServicio } from "../formulario-servicio";

export const metadata = { title: "Editar servicio | Panel | Studio de Maquillaje" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirAdminOLogin();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const servicio = await obtenerServicio(getDb(), id.data);
  if (!servicio) notFound();

  return <FormularioServicio accion={actualizarServicio} servicio={servicio} />;
}

export default function PaginaEditarServicio({ params }: PageProps<"/admin/servicios/[id]">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar servicio</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
