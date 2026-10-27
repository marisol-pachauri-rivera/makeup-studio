import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { obtenerReservaParaPanel } from "@/lib/reservas-panel/consultas";
import { idReservaSchema } from "@/lib/reservas-panel/esquemas";
import { AccionesDeReserva } from "../acciones-de-reserva";
import { cancelarReserva, rechazarPago, validarPago } from "../actions";
import {
  enlaceTelefono,
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO_CANCELACION,
  ETIQUETA_REEMBOLSO,
  formatearRango,
  formatearTurno,
  VARIANTE_ESTADO,
} from "../formato";

export const metadata = { title: "Reserva | Panel | Studio de Maquillaje" };

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirAdminOLogin();
  const id = idReservaSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const reserva = await obtenerReservaParaPanel(getDb(), id.data);
  if (!reserva) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={VARIANTE_ESTADO[reserva.estado]}>{ETIQUETA_ESTADO[reserva.estado]}</Badge>
        {reserva.estado === "pendiente_pago" && reserva.motivoRechazo !== null && (
          <Badge variant="outline">Esperando nuevo número</Badge>
        )}
      </div>

      <dl className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Dato etiqueta="Contacto">{reserva.nombreContacto}</Dato>
        <Dato etiqueta="Teléfono">
          <a href={enlaceTelefono(reserva.telefonoContacto)} className="underline-offset-4 hover:underline">
            {reserva.telefonoContacto}
          </a>
        </Dato>
        <Dato etiqueta="Número de operación">{reserva.numeroOperacion ?? "—"}</Dato>
        <Dato etiqueta="Monto total">{reserva.montoTotal}</Dato>
        <Dato etiqueta="Reembolso">{ETIQUETA_REEMBOLSO[reserva.estadoReembolso]}</Dato>
        {reserva.motivoRechazo !== null && <Dato etiqueta="Motivo del rechazo">{reserva.motivoRechazo}</Dato>}
        {reserva.motivoCancelacion !== null && (
          <Dato etiqueta="Motivo de la cancelación">{ETIQUETA_MOTIVO_CANCELACION[reserva.motivoCancelacion]}</Dato>
        )}
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-turnos">
        <h2 id="titulo-turnos" className="text-lg font-semibold">
          {reserva.turnos.length > 1 ? "Turnos" : "Turno"}
        </h2>
        <ul className="flex max-w-2xl flex-col gap-3">
          {reserva.turnos.map((turno, indice) => (
            // La posición como clave: dos integrantes pueden llamarse igual y tener el mismo horario.
            <li key={indice} className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
              <p className="font-medium">
                {turno.persona} · {turno.servicio}
              </p>
              <p>
                {formatearTurno(turno.inicio)} ({formatearRango(turno.inicio, turno.fin)}, hora de Lima) · con{" "}
                {turno.maquilladora}
              </p>
              <p className="text-muted-foreground">
                Precio {turno.precio}
                {turno.activa ? "" : " · horario liberado"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-acciones">
        <h2 id="titulo-acciones" className="text-lg font-semibold">
          Acciones
        </h2>
        <AccionesDeReserva reserva={reserva} validar={validarPago} rechazar={rechazarPago} cancelar={cancelarReserva} />
      </section>
    </>
  );
}

export default function PaginaDetalleDeReserva({ params }: PageProps<"/admin/reservas/[id]">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/reservas" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Volver a la lista
        </Link>
        <h1 className="text-2xl font-semibold">Reserva</h1>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
