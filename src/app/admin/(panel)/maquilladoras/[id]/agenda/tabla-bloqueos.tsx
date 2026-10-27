import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BloqueoListado } from "@/lib/agenda/bloqueos";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import { BotonQuitar } from "./boton-quitar";

/** `2026-12-24T09:00` → `24/12/2026 09:00`, en hora de Lima. */
export function formatearLocal(instante: Date): string {
  const { fecha, hora } = aPartesLocales(instante);
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio} ${hora}`;
}

/** Bloqueos ya ordenados por `listarBloqueos`: los vigentes primero y los pasados marcados. */
export function TablaBloqueos({
  bloqueos,
  maquilladoraId,
  quitar,
}: {
  bloqueos: readonly BloqueoListado[];
  maquilladoraId: number;
  quitar: (formData: FormData) => Promise<void>;
}) {
  if (bloqueos.length === 0) {
    return <p className="text-muted-foreground">No hay bloqueos cargados.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Desde</TableHead>
          <TableHead>Hasta</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bloqueos.map((b) => (
          <TableRow key={b.id} className={b.pasado ? "text-muted-foreground" : undefined}>
            <TableCell>{formatearLocal(b.inicio)}</TableCell>
            <TableCell>{formatearLocal(b.fin)}</TableCell>
            <TableCell className="font-medium">{b.motivo}</TableCell>
            <TableCell>{b.pasado ? <Badge variant="outline">Pasado</Badge> : <Badge>Vigente</Badge>}</TableCell>
            <TableCell>
              <div className="flex justify-end">
                <BotonQuitar
                  accion={quitar}
                  maquilladoraId={maquilladoraId}
                  id={b.id}
                  etiqueta={`Quitar bloqueo ${b.motivo} del ${formatearLocal(b.inicio)}`}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
