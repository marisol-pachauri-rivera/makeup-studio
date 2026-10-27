import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import { ANTICIPACION_MINIMA_HORAS } from "@/lib/reprogramacion/plazo";
import type { TurnoReprogramable } from "@/lib/reprogramacion/turnos";
import { fechaLarga } from "./formato-fecha";

/**
 * Un acceso para reprogramar por cada turno activo de una reserva confirmada. Con menos de 24 horas para
 * el turno el acceso aparece deshabilitado y explica el plazo; sin turnos (la reserva no está confirmada,
 * `obtenerTurnosReprogramables` devuelve vacío) no se muestra nada. El servidor decide siempre.
 */
export function SeccionDeReprogramacion({ token, turnos }: { token: string; turnos: readonly TurnoReprogramable[] }) {
  if (turnos.length === 0) return null;
  const esGrupo = turnos.length > 1;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-reprogramar">
      <h2 id="titulo-reprogramar" className="text-lg font-semibold">
        Reprogramar
      </h2>
      <p className="text-sm text-muted-foreground">
        Podés cambiar el horario o la maquilladora de {esGrupo ? "cada turno" : "tu turno"} hasta {ANTICIPACION_MINIMA_HORAS}{" "}
        horas antes, sin pagar de nuevo.
      </p>
      <ul className="flex flex-col gap-3">
        {turnos.map((turno) => {
          const { fecha, hora } = aPartesLocales(turno.inicio);
          const etiqueta = `Reprogramar el turno de ${turno.persona}`;
          return (
            <li key={turno.id} className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
              <p>
                <span className="font-medium">{turno.persona}</span> · <span className="capitalize">{fechaLarga(fecha)}</span>,{" "}
                {hora} (hora de Lima) · con {turno.maquilladora}
              </p>
              {turno.puedeReprogramar ? (
                <Link
                  href={`/reservas/${token}/reprogramar?linea=${turno.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
                  aria-label={etiqueta}
                >
                  Reprogramar
                </Link>
              ) : (
                <div className="flex flex-col gap-1">
                  <Button type="button" variant="outline" size="sm" disabled className="w-fit" aria-label={etiqueta}>
                    Reprogramar
                  </Button>
                  <p className="text-muted-foreground">
                    Ya no se puede reprogramar: faltan menos de {ANTICIPACION_MINIMA_HORAS} horas para este turno.
                    Escribile al studio.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
