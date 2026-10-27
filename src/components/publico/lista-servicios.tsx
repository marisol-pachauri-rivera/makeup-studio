import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { ServicioPublico } from "@/lib/publico/catalogo";

/**
 * Imágenes de prueba (rostros maquillados ilustrados): el servicio todavía no tiene imagen propia, así que se reparten por id. Son
 * decorativas (el nombre ya está en el título), por eso no llevan texto alternativo.
 */
const IMAGENES_DE_PRUEBA = [
  "/servicios-prueba/rostro-rosado.svg",
  "/servicios-prueba/rostro-crema.svg",
  "/servicios-prueba/rostro-amarillo.svg",
] as const;

export const imagenDePrueba = (id: number) => IMAGENES_DE_PRUEBA[Math.abs(id) % IMAGENES_DE_PRUEBA.length];

/** Catálogo público: una columna en el celular y rejilla en pantallas anchas. Solo recibe servicios activos. */
export function ListaServicios({ servicios }: { servicios: readonly ServicioPublico[] }) {
  if (servicios.length === 0) {
    return <p className="text-muted-foreground">Por ahora no hay servicios disponibles. Volvé a pasar pronto.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {servicios.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 overflow-hidden rounded-xl border bg-card pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de public/: next/image no lo optimiza */}
          <img src={imagenDePrueba(s.id)} alt="" className="aspect-[5/3] w-full object-cover" />
          <div className="flex flex-col gap-1 px-4">
            <h2 className="text-lg font-semibold">{s.nombre}</h2>
            {s.descripcion && <p className="text-sm text-muted-foreground">{s.descripcion}</p>}
          </div>
          <dl className="flex gap-6 px-4 text-sm">
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
            className={buttonVariants({ className: "mx-4 mt-auto" })}
            aria-label={`Ver horarios de ${s.nombre}`}
          >
            Ver horarios
          </Link>
        </li>
      ))}
    </ul>
  );
}
