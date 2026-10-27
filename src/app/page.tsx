import { connection } from "next/server";
import { Suspense } from "react";
import { ListaServicios } from "@/components/publico/lista-servicios";
import { getDb } from "@/db";
import { listarServiciosActivos } from "@/lib/publico/catalogo";

async function Catalogo() {
  // La lectura es por petición: sin esto Next intentaría abrir la base al prerenderizar (y en el build no hay).
  await connection();
  const servicios = await listarServiciosActivos(getDb());
  return <ListaServicios servicios={servicios} />;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Studio de Maquillaje</h1>
        <p className="text-muted-foreground">Elegí un servicio para ver los horarios disponibles.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Cargando servicios…</p>}>
        <Catalogo />
      </Suspense>
    </main>
  );
}
