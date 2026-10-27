import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { ServicioPublico } from "@/lib/publico/catalogo";

/** Catálogo público: una columna en el celular y rejilla en pantallas anchas. Solo recibe servicios activos. */
export function ListaServicios({ servicios }: { servicios: readonly ServicioPublico[] }) {
  if (servicios.length === 0) {
    return <p className="text-muted-foreground">Por ahora no hay servicios disponibles. Volvé a pasar pronto.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {servicios.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{s.nombre}</h2>
            {s.descripcion && <p className="text-sm text-muted-foreground">{s.descripcion}</p>}
          </div>
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-muted-foreground">Precio</dt>
              <dd className="font-medium">{s.precio}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="font-medium">{s.duracionMinutos} min</dd>
            </div>
          </dl>
          <Link
            href={`/servicios/${s.id}/disponibilidad`}
            className={buttonVariants({ className: "mt-auto" })}
            aria-label={`Ver horarios de ${s.nombre}`}
          >
            Ver horarios
          </Link>
        </li>
      ))}
    </ul>
  );
}
