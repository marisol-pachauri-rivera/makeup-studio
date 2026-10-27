import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PantallaReprogramacion } from "@/components/publico/pantalla-reprogramacion";
import { getDb } from "@/db";
import { idSchema } from "@/lib/catalogo/esquemas";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { elegirDia } from "@/lib/disponibilidad/dia";
import { leerParametros } from "@/lib/disponibilidad/parametros";
import { listarMaquilladorasActivas } from "@/lib/publico/catalogo";
import { obtenerTurnosReprogramables } from "@/lib/reprogramacion/turnos";
import { reprogramar } from "./actions";

// El enlace con token es la única credencial (ADR 0004): no se indexa. Las cabeceras de `next.config.ts`
// (`/reservas/:path*`) cubren esta subruta: no se cachea ni se envía como referencia.
export const metadata = {
  title: "Reprogramar tu turno | Studio de Maquillaje",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/reservas/[token]/reprogramar">;

/** Un parámetro repetido es ambiguo: se trata como ausente. */
const unico = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : undefined);

async function Contenido({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  // Un token inválido y uno desconocido responden igual, para no dar pistas.
  const token = z.uuid().safeParse((await params).token);
  if (!token.success) notFound();
  const buscar = await searchParams;
  const linea = idSchema.safeParse(unico(buscar.linea));
  if (!linea.success) notFound();
  const { maquilladoraId, fecha } = leerParametros(buscar);

  // El reloj se lee después de `params` (ya es tiempo de petición): sirve para el plazo y la disponibilidad.
  const ahora = new Date();
  const db = getDb();

  // Solo los turnos activos de una reserva confirmada: otro estado o un turno ajeno es "no encontrado".
  const turnos = await obtenerTurnosReprogramables(db, token.data, ahora);
  const turno = turnos.find((t) => t.id === linea.data);
  if (!turno) notFound();

  const maquilladoras = await listarMaquilladorasActivas(db);
  // Una maquilladora inexistente o inactiva equivale a no haber elegido ninguna.
  const elegida = turno.puedeReprogramar ? maquilladoras.find((m) => m.id === maquilladoraId) : undefined;
  const dias = elegida
    ? await consultarDisponibilidad(db, {
        // La duración es la del turno actual, no la del servicio de hoy (el catálogo pudo cambiar).
        servicio: { duracionMinutos: (turno.fin.getTime() - turno.inicio.getTime()) / 60_000 },
        maquilladoraId: elegida.id,
        ahora,
        ignorarLineaId: turno.id,
      })
    : [];
  const diaElegido = elegirDia(dias, fecha);

  // El horario elegido solo vale si de verdad se ofrece: cualquier otro valor equivale a no haber elegido.
  const pedido = z.iso.datetime().safeParse(unico(buscar.inicio));
  const inicioPedido = pedido.success ? new Date(pedido.data) : undefined;
  const inicioElegido = diaElegido?.inicios.find((i) => i.getTime() === inicioPedido?.getTime());

  return (
    <PantallaReprogramacion
      token={token.data}
      turno={turno}
      maquilladoras={maquilladoras}
      elegida={elegida}
      dias={dias}
      diaElegido={diaElegido}
      inicioElegido={inicioElegido}
      accion={reprogramar}
    />
  );
}

export default function PaginaReprogramar({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
