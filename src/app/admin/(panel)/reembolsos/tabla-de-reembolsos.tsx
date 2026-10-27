import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReembolsoPendiente } from "@/lib/cancelacion/reembolsos";
import { enlaceTelefono } from "../reservas/formato";
import type { AccionDeReserva } from "../reservas/boton-validar";
import { BotonMarcarRealizado } from "./boton-marcar";

/** Reembolsos por hacer: monto y número de operación para buscar el pago en la billetera, y contacto. */
export function TablaDeReembolsos({ filas, accion }: { filas: ReembolsoPendiente[]; accion: AccionDeReserva }) {
  if (filas.length === 0) {
    return <p className="text-muted-foreground">No hay reembolsos por hacer.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contacto</TableHead>
          <TableHead>Número de operación</TableHead>
          <TableHead>Monto a devolver</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <TableRow key={fila.id}>
            <TableCell>
              <div className="font-medium">{fila.nombreContacto}</div>
              <a href={enlaceTelefono(fila.telefonoContacto)} className="text-sm underline-offset-4 hover:underline">
                {fila.telefonoContacto}
              </a>
            </TableCell>
            <TableCell>{fila.numeroOperacion ?? "Sin número registrado"}</TableCell>
            <TableCell>{fila.montoTotal}</TableCell>
            <TableCell>
              <div className="flex items-start justify-end gap-2">
                <Link href={`/admin/reservas/${fila.id}`} className="py-1 text-sm underline-offset-4 hover:underline">
                  Ver reserva
                </Link>
                <BotonMarcarRealizado id={fila.id} accion={accion} registro={fila.nombreContacto} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
