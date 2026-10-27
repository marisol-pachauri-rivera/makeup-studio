import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PantallaDisponibilidad } from "@/components/publico/pantalla-disponibilidad";
import { getDb } from "@/db";
import { idSchema } from "@/lib/catalogo/esquemas";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { elegirDia } from "@/lib/disponibilidad/dia";
import { leerParametros } from "@/lib/disponibilidad/parametros";
import { listarMaquilladorasActivas, obtenerServicioActivo } from "@/lib/publico/catalogo";

export const metadata = { title: "Horarios disponibles | Studio de Maquillaje" };

type Props = PageProps<"/servicios/[servicioId]/disponibilidad">;

async function Contenido({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  // Leer los parámetros es lo que pasa la página a tiempo de petición; recién después se toca la base.
  const id = idSchema.safeParse((await params).servicioId);
  if (!id.success) notFound();
  const { maquilladoraId, fecha } = leerParametros(await searchParams);

  const db = getDb();
  const servicio = await obtenerServicioActivo(db, id.data);
  if (!servicio) notFound();

  const maquilladoras = await listarMaquilladorasActivas(db);
  // Una maquilladora inexistente o inactiva equivale a no haber elegido ninguna.
  const elegida = maquilladoras.find((m) => m.id === maquilladoraId);
  const dias = elegida ? await consultarDisponibilidad(db, { servicio, maquilladoraId: elegida.id, ahora: new Date() }) : [];

  return (
    <PantallaDisponibilidad
      servicio={servicio}
      maquilladoras={maquilladoras}
      elegida={elegida}
      dias={dias}
      diaElegido={elegirDia(dias, fecha)}
    />
  );
}

export default function PaginaDisponibilidad({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Cargando horarios…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
