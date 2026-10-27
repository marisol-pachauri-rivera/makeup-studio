import Link from "next/link";
import { Suspense } from "react";
import { BotonEstado } from "@/components/panel/boton-estado";
import { EstadoBadge } from "@/components/panel/estado-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { listarServicios } from "@/lib/catalogo/servicios";
import { cambiarEstadoServicio } from "./actions";

export const metadata = { title: "Servicios | Panel | Studio de Maquillaje" };

async function ListaDeServicios() {
  // Primero la sesión: leer la petición es lo que aplaza el prerender (ver lib/auth/sesion.ts).
  await requerirAdminOLogin();
  const servicios = await listarServicios(getDb());

  if (servicios.length === 0) {
    return (
      <p className="text-muted-foreground">Todavía no hay servicios. Creá el primero para armar el catálogo.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead className="text-right">Precio</TableHead>
          <TableHead className="text-right">Duración</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {servicios.map((s) => (
          <TableRow key={s.id} className={s.activo ? undefined : "text-muted-foreground"}>
            <TableCell className="font-medium">{s.nombre}</TableCell>
            <TableCell className="text-right tabular-nums">{s.precio}</TableCell>
            <TableCell className="text-right tabular-nums">{s.duracionMinutos} min</TableCell>
            <TableCell>
              <EstadoBadge activo={s.activo} />
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/servicios/${s.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Editar ${s.nombre}`}
                >
                  Editar
                </Link>
                <BotonEstado accion={cambiarEstadoServicio} id={s.id} activo={s.activo} registro={s.nombre} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PaginaServicios() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <Link href="/admin/servicios/nuevo" className={buttonVariants()}>
          Nuevo servicio
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <ListaDeServicios />
      </Suspense>
    </main>
  );
}
