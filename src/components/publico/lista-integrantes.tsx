"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { Integrante } from "@/lib/reserva/asistente";
import { MAX_INTEGRANTES } from "@/lib/reserva/grupo";
import { MAX_NOMBRE } from "@/lib/reserva/esquemas";
import { fechaLarga } from "./formato-fecha";

type Props = {
  integrantes: readonly Integrante[];
  /** La integrante cuyo horario se está eligiendo, si hay una. */
  personaActivaId?: string;
  /** Avisos por posición de la integrante (choque de horario, servicio inactivo, solapamiento, errores). */
  avisos?: Readonly<Record<number, readonly string[]>>;
  puedeAgregar: boolean;
  onRenombrar: (id: string, nombre: string) => void;
  onElegirHorario: (id: string) => void;
  onQuitar: (id: string) => void;
  onAgregar: () => void;
};

const nombreDe = (i: Integrante, indice: number) => i.nombre.trim() || `la integrante ${indice + 1}`;

/**
 * Las integrantes de un grupo: nombre editable, resumen de su servicio, maquilladora y horario de Lima,
 * y un acceso para elegir o cambiar el horario de cada una. Es presentacional: quien la usa guarda los
 * cambios. Marca a las incompletas y a las que el servidor señaló, sin borrar nada de lo ya cargado.
 */
export function ListaIntegrantes({
  integrantes,
  personaActivaId,
  avisos = {},
  puedeAgregar,
  onRenombrar,
  onElegirHorario,
  onQuitar,
  onAgregar,
}: Props) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-integrantes">
      <h2 id="titulo-integrantes" className="text-lg font-semibold">
        Integrantes del grupo
      </h2>

      <ul className="flex flex-col gap-3">
        {integrantes.map((integrante, indice) => {
          const completa = integrante.servicio && integrante.maquilladora && integrante.inicio;
          const { fecha, hora } = integrante.inicio ? aPartesLocales(new Date(integrante.inicio)) : { fecha: "", hora: "" };
          const avisosDeEsta = avisos[indice] ?? [];
          const activa = integrante.id === personaActivaId;
          const idNombre = `integrante-${integrante.id}`;

          return (
            <li
              key={integrante.id}
              className="flex flex-col gap-3 rounded-xl border p-4"
              aria-current={activa ? "true" : undefined}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={idNombre}>Nombre de la integrante {indice + 1}</Label>
                <Input
                  id={idNombre}
                  defaultValue={integrante.nombre}
                  maxLength={MAX_NOMBRE}
                  autoComplete="off"
                  onChange={(e) => onRenombrar(integrante.id, e.target.value)}
                />
                {integrante.nombre.trim() === "" && <p className="text-sm text-muted-foreground">Falta el nombre.</p>}
              </div>

              {completa ? (
                <p className="text-sm">
                  <span className="font-medium">{integrante.servicio?.nombre}</span> con{" "}
                  <span className="font-medium">{integrante.maquilladora?.nombre}</span>
                  {" · "}
                  <span className="capitalize">{fechaLarga(fecha)}</span> a las {hora} (hora de Lima) ·{" "}
                  {integrante.servicio?.precio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Falta elegir el horario.</p>
              )}

              {activa && <p className="text-sm text-muted-foreground">Eligiendo el horario de esta integrante…</p>}

              {avisosDeEsta.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-destructive" role="alert">
                  {avisosDeEsta.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onElegirHorario(integrante.id)}
                  aria-label={`${avisosDeEsta.length > 0 ? "Elegir otro horario" : completa ? "Cambiar horario" : "Elegir horario"} de ${nombreDe(integrante, indice)}`}
                >
                  {avisosDeEsta.length > 0 ? "Elegir otro horario" : completa ? "Cambiar horario" : "Elegir horario"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={integrantes.length <= 1}
                  onClick={() => onQuitar(integrante.id)}
                  aria-label={`Quitar a ${nombreDe(integrante, indice)}`}
                >
                  Quitar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-start gap-1">
        <Button type="button" variant="outline" disabled={!puedeAgregar} onClick={onAgregar}>
          Agregar integrante
        </Button>
        {!puedeAgregar && (
          <p className="text-sm text-muted-foreground">Un grupo admite hasta {MAX_INTEGRANTES} integrantes.</p>
        )}
      </div>
    </section>
  );
}
