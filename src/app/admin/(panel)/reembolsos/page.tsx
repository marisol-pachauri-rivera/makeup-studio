import { Suspense } from "react";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { listarReembolsosPendientes } from "@/lib/cancelacion/reembolsos";
import { marcarReembolso } from "./actions";
import { TablaDeReembolsos } from "./tabla-de-reembolsos";

export const metadata = { title: "Reembolsos | Panel | Studio de Maquillaje" };

async function ListaDeReembolsos() {
  // Primero la sesión: leer la petición es lo que aplaza el prerender (ver lib/auth/sesion.ts).
  await requerirAdminOLogin();
  const filas = await listarReembolsosPendientes(getDb());
  return <TablaDeReembolsos filas={filas} accion={marcarReembolso} />;
}

export default function PaginaReembolsos() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Reembolsos</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Reservas canceladas con un pago por devolver. Devolvé el monto desde tu billetera y marcalo como realizado.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <ListaDeReembolsos />
      </Suspense>
    </main>
  );
}
