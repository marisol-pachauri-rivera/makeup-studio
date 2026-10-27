import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SeccionDeMaquilladora } from "@/lib/agenda-panel/armar-dia";

/**
 * La agenda de una maquilladora en el día: su horario de trabajo y, en orden de hora, sus turnos y
 * bloqueos. Todo estado va escrito (no solo con color) y la tabla se desplaza dentro de su contenedor, así
 * que la página no necesita scroll horizontal en el celular. Es de solo lectura.
 */
export function AgendaMaquilladora({ seccion }: { seccion: SeccionDeMaquilladora }) {
  const titulo = `agenda-${seccion.id}`;

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" aria-labelledby={titulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titulo} className="text-lg font-semibold">
          {seccion.nombre}
          {!seccion.activa && <span className="font-normal text-muted-foreground"> (inactiva)</span>}
        </h2>
        <Link
          href={`/admin/maquilladoras/${seccion.id}/agenda`}
          className="text-sm underline-offset-4 hover:underline"
          aria-label={`Horario y bloqueos de ${seccion.nombre}`}
        >
          Horario y bloqueos
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        {seccion.horario.length === 0 ? "No trabaja este día" : `Trabaja ${seccion.horario.join(" y ")}`}
      </p>

      {seccion.filas.length === 0 ? (
        <p className="text-sm">Sin turnos ni bloqueos.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seccion.filas.map((fila) =>
              fila.tipo === "bloqueo" ? (
                <TableRow key={fila.clave}>
                  <TableCell className="whitespace-nowrap">{fila.hora}</TableCell>
                  <TableCell>{fila.motivo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">Bloqueo</Badge>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={fila.clave}>
                  <TableCell className="whitespace-nowrap">{fila.hora}</TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {fila.persona} · {fila.servicio}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Contacto: {fila.contacto ? `${fila.contacto} · ` : ""}
                      {fila.telefono}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={fila.estado === "Confirmada" ? "default" : "secondary"}>{fila.estado}</Badge>
                      {fila.marcas.map((marca) => (
                        <Badge key={marca} variant="outline">
                          {marca}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
