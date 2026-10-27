import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { listarBloqueos } from "@/lib/agenda/bloqueos";
import { listarHorarios } from "@/lib/agenda/horarios";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { idSchema } from "@/lib/catalogo/esquemas";
import { obtenerMaquilladora } from "@/lib/catalogo/maquilladoras";
import { agregarBloqueo, agregarHorario, quitarBloqueo, quitarHorario } from "./actions";
import { FormularioBloqueo } from "./formulario-bloqueo";
import { FormularioHorario } from "./formulario-horario";
import { HorarioSemanal } from "./horario-semanal";
import { TablaBloqueos } from "./tabla-bloqueos";

export const metadata = { title: "Agenda | Panel | Studio de Maquillaje" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirAdminOLogin();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const db = getDb();
  // Sin filtrar por `activa`: se puede preparar la agenda antes de reactivar a la maquilladora.
  const maquilladora = await obtenerMaquilladora(db, id.data);
  if (!maquilladora) notFound();
  const [horarios, bloqueos] = await Promise.all([listarHorarios(db, id.data), listarBloqueos(db, id.data)]);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Agenda de {maquilladora.nombre}</h1>
        <Link href="/admin/maquilladoras" className={buttonVariants({ variant: "outline" })}>
          Volver a maquilladoras
        </Link>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="titulo-horario">
        <h2 id="titulo-horario" className="text-xl font-semibold">
          Horario semanal
        </h2>
        <HorarioSemanal horarios={horarios} maquilladoraId={maquilladora.id} quitar={quitarHorario} />
        <h3 className="font-medium">Agregar un tramo</h3>
        <FormularioHorario accion={agregarHorario} maquilladoraId={maquilladora.id} />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="titulo-bloqueos">
        <h2 id="titulo-bloqueos" className="text-xl font-semibold">
          Bloqueos
        </h2>
        <p className="text-sm text-muted-foreground">
          Ausencias o cierres. No cancelan las reservas que ya existan en ese rango.
        </p>
        <TablaBloqueos bloqueos={bloqueos} maquilladoraId={maquilladora.id} quitar={quitarBloqueo} />
        <h3 className="font-medium">Agregar un bloqueo</h3>
        <FormularioBloqueo accion={agregarBloqueo} maquilladoraId={maquilladora.id} />
      </section>
    </>
  );
}

export default function PaginaAgenda({ params }: PageProps<"/admin/maquilladoras/[id]/agenda">) {
  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
