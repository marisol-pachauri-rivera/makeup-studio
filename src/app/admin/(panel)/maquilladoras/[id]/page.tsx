import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EnlaceAgenda } from "@/components/panel/enlace-agenda";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { idSchema } from "@/lib/catalogo/esquemas";
import { obtenerMaquilladora } from "@/lib/catalogo/maquilladoras";
import { actualizarMaquilladora } from "../actions";
import { FormularioMaquilladora } from "../formulario-maquilladora";

export const metadata = { title: "Editar maquilladora | Panel | Studio de Maquillaje" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirAdminOLogin();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const maquilladora = await obtenerMaquilladora(getDb(), id.data);
  if (!maquilladora) notFound();

  return (
    <>
      <div>
        <EnlaceAgenda id={maquilladora.id} nombre={maquilladora.nombre} />
      </div>
      <FormularioMaquilladora accion={actualizarMaquilladora} maquilladora={maquilladora} />
    </>
  );
}

export default function PaginaEditarMaquilladora({ params }: PageProps<"/admin/maquilladoras/[id]">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar maquilladora</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
