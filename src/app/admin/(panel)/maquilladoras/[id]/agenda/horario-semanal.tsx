import { agruparPorDia, horaCorta, NOMBRE_DIA } from "@/lib/agenda/dias";
import type { Horario } from "@/lib/agenda/horarios";
import { BotonQuitar } from "./boton-quitar";

/** Los siete días, lunes primero, con sus tramos y un botón para quitar cada uno. */
export function HorarioSemanal({
  horarios,
  maquilladoraId,
  quitar,
}: {
  horarios: readonly Horario[];
  maquilladoraId: number;
  quitar: (formData: FormData) => Promise<void>;
}) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {agruparPorDia(horarios).map(({ dia, tramos }) => (
        <li key={dia} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-6">
          <h3 className="w-28 shrink-0 font-medium">{NOMBRE_DIA[dia]}</h3>
          {tramos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trabaja este día.</p>
          ) : (
            <ul className="flex flex-1 flex-col gap-2">
              {tramos.map((t) => {
                const rango = `${horaCorta(t.horaInicio)} a ${horaCorta(t.horaFin)}`;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-4">
                    <span>{rango}</span>
                    <BotonQuitar
                      accion={quitar}
                      maquilladoraId={maquilladoraId}
                      id={t.id}
                      etiqueta={`Quitar tramo de ${NOMBRE_DIA[dia]} de ${rango}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
