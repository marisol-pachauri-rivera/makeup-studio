import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADOS_RESERVA } from "@/db/schema";
import { getDb } from "@/db";
import { requerirAdminOLogin } from "@/lib/auth/sesion";
import { listarReservas, type FilaDeReserva } from "@/lib/reservas-panel/consultas";
import { leerParametrosDeLista, type FiltroDeEstado } from "@/lib/reservas-panel/esquemas";
import { enlaceTelefono, ETIQUETA_ESTADO, ETIQUETA_REEMBOLSO, formatearTurno, VARIANTE_ESTADO } from "./formato";

export const metadata = { title: "Reservas | Panel | Studio de Maquillaje" };

function direccion(pagina: number, estado?: FiltroDeEstado) {
  const parametros = new URLSearchParams();
  if (estado) parametros.set("estado", estado);
  if (pagina > 1) parametros.set("pagina", String(pagina));
  const texto = parametros.toString();
  return texto ? `/admin/reservas?${texto}` : "/admin/reservas";
}

/** Marcas de una pendiente de pago, con texto: no dependen solo del color. */
function Marca({ fila }: { fila: FilaDeReserva }) {
  if (fila.esperandoNuevoNumero) return <Badge variant="outline">Esperando nuevo número</Badge>;
  if (fila.plazoVencido) return <Badge variant="outline">Plazo vencido</Badge>;
  return null;
}

function Filtros({ estado }: { estado?: FiltroDeEstado }) {
  const opciones = [{ valor: undefined, etiqueta: "Todas" }, ...ESTADOS_RESERVA.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO[e] }))];
  return (
    <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
      {opciones.map(({ valor, etiqueta }) => (
        <Link
          key={etiqueta}
          href={direccion(1, valor)}
          aria-current={valor === estado ? "true" : undefined}
          className={buttonVariants({ variant: valor === estado ? "default" : "outline", size: "sm" })}
        >
          {etiqueta}
        </Link>
      ))}
    </nav>
  );
}

async function ListaDeReservas({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  // Primero la sesión y la dirección: leer la petición es lo que aplaza el prerender; el reloj, después.
  await requerirAdminOLogin();
  const { pagina, estado } = leerParametrosDeLista(await searchParams);
  const ahora = new Date();
  const resultado = await listarReservas(getDb(), { pagina, estado, ahora });

  return (
    <>
      <Filtros estado={estado} />

      {resultado.filas.length === 0 ? (
        <p className="text-muted-foreground">
          {resultado.total === 0 ? "No hay reservas para mostrar." : "No hay reservas en esta página."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estado</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Número de operación</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Primer turno</TableHead>
              <TableHead>Personas</TableHead>
              <TableHead>Reembolso</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.filas.map((fila) => (
              <TableRow key={fila.id}>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={VARIANTE_ESTADO[fila.estado]}>{ETIQUETA_ESTADO[fila.estado]}</Badge>
                    <Marca fila={fila} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{fila.nombreContacto}</div>
                  <a href={enlaceTelefono(fila.telefonoContacto)} className="text-sm underline-offset-4 hover:underline">
                    {fila.telefonoContacto}
                  </a>
                </TableCell>
                <TableCell>{fila.numeroOperacion ?? "—"}</TableCell>
                <TableCell>{fila.montoTotal}</TableCell>
                <TableCell>{formatearTurno(fila.primerTurno)}</TableCell>
                <TableCell>{fila.personas}</TableCell>
                <TableCell>{ETIQUETA_REEMBOLSO[fila.estadoReembolso]}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Link
                      href={`/admin/reservas/${fila.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      aria-label={`Ver la reserva de ${fila.nombreContacto}`}
                    >
                      Ver
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <nav aria-label="Paginación" className="flex items-center gap-3 text-sm">
        {pagina > 1 && (
          <Link href={direccion(pagina - 1, estado)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Página anterior
          </Link>
        )}
        <span className="text-muted-foreground">
          Página {pagina} · {resultado.total} {resultado.total === 1 ? "reserva" : "reservas"}
        </span>
        {resultado.hayMas && (
          <Link href={direccion(pagina + 1, estado)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Página siguiente
          </Link>
        )}
      </nav>
    </>
  );
}

export default function PaginaReservas({ searchParams }: PageProps<"/admin/reservas">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Reservas</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <ListaDeReservas searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
