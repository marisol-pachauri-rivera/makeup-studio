import { Suspense } from "react";
import { fechaLarga } from "@/components/publico/formato-fecha";
import { getDb } from "@/db";
import { armarDia } from "@/lib/agenda-panel/armar-dia";
import { obtenerAgendaDelDia } from "@/lib/agenda-panel/consulta";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { hoyLocal } from "@/lib/disponibilidad/fechas";
import { leerParametros } from "@/lib/disponibilidad/parametros";
import { AgendaMaquilladora } from "./agenda-maquilladora";
import { NavegacionDias } from "./navegacion-dias";

export const metadata = { title: "Agenda | Panel | Studio de Maquillaje" };

async function Contenido({ searchParams }: Pick<PageProps<"/admin/agenda">, "searchParams">) {
  // Primero la sesión y la dirección: leer la petición es lo que aplaza el prerender; el reloj, después.
  await requerirAdminOLogin();
  const { fecha: pedida } = leerParametros({ fecha: (await searchParams).fecha });
  const ahora = new Date();
  const hoy = hoyLocal(ahora);
  // Una fecha inválida, inexistente o repetida equivale a no haberla mandado: se muestra hoy.
  const fecha = pedida ?? hoy;

  const secciones = armarDia(await obtenerAgendaDelDia(getDb(), fecha, ahora));

  return (
    <>
      <NavegacionDias fecha={fecha} hoy={hoy} />
      <h2 className="text-lg font-semibold capitalize">
        {fechaLarga(fecha)}
        {fecha === hoy && <span className="font-normal normal-case text-muted-foreground"> · hoy</span>}
      </h2>
      <p className="text-sm text-muted-foreground">Horas de Lima.</p>
      {secciones.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay maquilladoras activas ni turnos para este día.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {secciones.map((seccion) => (
            <AgendaMaquilladora key={seccion.id} seccion={seccion} />
          ))}
        </div>
      )}
    </>
  );
}

export default function PaginaAgenda({ searchParams }: PageProps<"/admin/agenda">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
