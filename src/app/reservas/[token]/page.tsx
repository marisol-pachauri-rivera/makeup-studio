import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { EstadoDeReservaVista } from "@/components/publico/estado-de-reserva";
import { SeccionDeReprogramacion } from "@/components/publico/seccion-de-reprogramacion";
import { getDb } from "@/db";
import { leerConfiguracionDePago } from "@/lib/pago/configuracion";
import { obtenerTurnosReprogramables } from "@/lib/reprogramacion/turnos";
import { obtenerReservaPorToken } from "@/lib/reserva/estado";
import { cancelarReserva, ingresarNumero } from "./actions";

// El enlace con token es la única credencial (ADR 0004): no se indexa. Las cabeceras de
// `next.config.ts` además impiden cachearlo y enviarlo como referencia a otros sitios.
export const metadata = {
  title: "Tu reserva | Studio de Maquillaje",
  robots: { index: false, follow: false },
};

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  // Un token con formato inválido y uno desconocido responden igual, para no dar pistas.
  const token = z.uuid().safeParse((await params).token);
  if (!token.success) notFound();

  const reserva = await obtenerReservaPorToken(getDb(), token.data);
  if (!reserva) notFound();

  // El reloj se lee después de `params` (ya es tiempo de petición): sirve para saber si el plazo pasó.
  const ahora = new Date();
  const pago = { token: token.data, configuracion: leerConfiguracionDePago(), accion: ingresarNumero, ahora };
  const cancelacion = { token: token.data, accion: cancelarReserva, ahora };
  // Vacío si la reserva no está confirmada: la sección de reprogramar solo aparece con el pago validado.
  const turnos = await obtenerTurnosReprogramables(getDb(), token.data, ahora);
  return (
    <>
      <EstadoDeReservaVista reserva={reserva} pago={pago} cancelacion={cancelacion} />
      <SeccionDeReprogramacion token={token.data} turnos={turnos} />
    </>
  );
}

export default function PaginaEstadoDeReserva({ params }: PageProps<"/reservas/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Tu reserva</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando tu reserva…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
