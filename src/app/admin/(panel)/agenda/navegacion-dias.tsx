import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { fechaCorta } from "@/components/publico/formato-fecha";
import { semanaDe } from "@/lib/agenda-panel/rango";
import { sumarDias } from "@/lib/disponibilidad/fechas";

const direccion = (fecha: string) => `/admin/agenda?fecha=${fecha}`;

/**
 * Moverse entre días: anterior, siguiente, hoy, la franja de la semana (lunes a domingo) y un selector de
 * fecha que funciona sin JavaScript (un formulario GET). El día mostrado se indica con texto además del
 * estilo, para no depender del color.
 */
export function NavegacionDias({ fecha, hoy }: { fecha: string; hoy: string }) {
  return (
    <nav aria-label="Navegar entre días" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={direccion(sumarDias(fecha, -1))} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Anterior
        </Link>
        <Link href={direccion(hoy)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Hoy
        </Link>
        <Link href={direccion(sumarDias(fecha, 1))} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Siguiente
        </Link>
      </div>

      <ul aria-label="Días de la semana" className="flex flex-wrap gap-2">
        {semanaDe(fecha).map((dia) => {
          const mostrado = dia === fecha;
          return (
            <li key={dia}>
              <Link
                href={direccion(dia)}
                aria-current={mostrado ? "date" : undefined}
                className={buttonVariants({ variant: mostrado ? "default" : "outline", size: "sm" })}
              >
                {fechaCorta(dia)}
                {mostrado && <span className="sr-only"> (día mostrado)</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <form method="get" action="/admin/agenda" className="flex flex-wrap items-center gap-2">
        <label htmlFor="fecha-agenda" className="text-sm">
          Ir a una fecha
        </label>
        <input
          id="fecha-agenda"
          type="date"
          name="fecha"
          defaultValue={fecha}
          required
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Ir
        </Button>
      </form>
    </nav>
  );
}
