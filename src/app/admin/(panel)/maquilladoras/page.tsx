import Link from "next/link";
import { Suspense } from "react";
import { BotonEstado } from "@/components/panel/boton-estado";
import { EnlaceAgenda } from "@/components/panel/enlace-agenda";
import { EstadoBadge } from "@/components/panel/estado-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { listarMaquilladoras } from "@/lib/catalogo/maquilladoras";
import { cambiarEstadoMaquilladora } from "./actions";

export const metadata = { title: "Maquilladoras | Panel | Studio de Maquillaje" };

async function ListaDeMaquilladoras() {
  // Primero la sesión: leer la petición es lo que aplaza el prerender (ver lib/auth/sesion.ts).
  await requerirAdminOLogin();
  const maquilladoras = await listarMaquilladoras(getDb());

  if (maquilladoras.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay maquilladoras. Creá la primera para poder cargarle horarios.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {maquilladoras.map((m) => (
          <TableRow key={m.id} className={m.activa ? undefined : "text-muted-foreground"}>
            <TableCell className="font-medium">{m.nombre}</TableCell>
            <TableCell>
              <EstadoBadge activo={m.activa} textos={["Activa", "Inactiva"]} />
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <EnlaceAgenda id={m.id} nombre={m.nombre} />
                <Link
                  href={`/admin/maquilladoras/${m.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Editar ${m.nombre}`}
                >
                  Editar
                </Link>
                <BotonEstado accion={cambiarEstadoMaquilladora} id={m.id} activo={m.activa} registro={m.nombre} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PaginaMaquilladoras() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Maquilladoras</h1>
        <Link href="/admin/maquilladoras/nuevo" className={buttonVariants()}>
          Nueva maquilladora
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <ListaDeMaquilladoras />
      </Suspense>
    </main>
  );
}
