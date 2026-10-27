import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { DiaConHuecos } from "@/lib/disponibilidad/huecos";
import type { MaquilladoraPublica } from "@/lib/publico/catalogo";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/reprogramacion/formulario";
import { ANTICIPACION_MINIMA_HORAS } from "@/lib/reprogramacion/plazo";
import type { TurnoReprogramable } from "@/lib/reprogramacion/turnos";
import { fechaCorta, fechaLarga } from "./formato-fecha";
import { FormularioReprogramacion } from "./formulario-reprogramacion";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<ResultadoFormulario>;

type Props = {
  token: string;
  turno: TurnoReprogramable;
  maquilladoras: readonly MaquilladoraPublica[];
  /** La maquilladora elegida; `undefined` si todavía no eligió (el sistema nunca elige por ella). */
  elegida?: MaquilladoraPublica;
  /** Días con turnos libres de la elegida, para la duración del turno (sin contar el propio turno). */
  dias: readonly DiaConHuecos[];
  diaElegido?: DiaConHuecos;
  /** El horario elegido (ya comprobado contra `dias`); `undefined` si todavía no eligió. */
  inicioElegido?: Date;
  accion: Accion;
};

const horaDe = (instante: Date) => aPartesLocales(instante).hora;
const cuando = (instante: Date) => {
  const { fecha, hora } = aPartesLocales(instante);
  return `${fechaLarga(fecha)} a las ${hora}`;
};

/**
 * Elegir el nuevo horario de un turno: maquilladora, día y horario como enlaces (la selección vive en la
 * URL y no se guarda nada hasta confirmar), un resumen "de X a Y" y el formulario de confirmación. Pasado
 * el plazo de 24 horas no se ofrece nada: se explica y se vuelve a la página de estado.
 */
export function PantallaReprogramacion({ token, turno, maquilladoras, elegida, dias, diaElegido, inicioElegido, accion }: Props) {
  const base = `/reservas/${token}/reprogramar?linea=${turno.id}`;
  const volver = (
    <Link href={`/reservas/${token}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
      Volver a mi reserva
    </Link>
  );

  const encabezado = (
    <header className="flex flex-col gap-1">
      {volver}
      <h1 className="text-2xl font-semibold">Reprogramar tu turno</h1>
      <p className="text-sm">
        Turno actual: {turno.servicio} para {turno.persona}, con {turno.maquilladora},{" "}
        <span className="capitalize">{cuando(turno.inicio)}</span> (hora de Lima). Es el mismo servicio y no se cobra
        de nuevo.
      </p>
    </header>
  );

  if (!turno.puedeReprogramar) {
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          Ya no se puede reprogramar desde acá: faltan menos de {ANTICIPACION_MINIMA_HORAS} horas para tu turno.
          Escribile al studio.
        </p>
      </div>
    );
  }

  const volverA = `${base}&maquilladora=${elegida?.id}${diaElegido ? `&fecha=${diaElegido.fecha}` : ""}`;

  return (
    <div className="flex flex-col gap-8">
      {encabezado}

      <section className="flex flex-col gap-3" aria-labelledby="titulo-maquilladora">
        <h2 id="titulo-maquilladora" className="text-lg font-semibold">
          Elegí una maquilladora
        </h2>
        {maquilladoras.length === 0 ? (
          <p className="text-muted-foreground">Por ahora no hay maquilladoras disponibles.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {maquilladoras.map((m) => (
              <li key={m.id}>
                <Link
                  href={`${base}&maquilladora=${m.id}`}
                  className={buttonVariants({ variant: m.id === elegida?.id ? "default" : "outline" })}
                  aria-current={m.id === elegida?.id ? "true" : undefined}
                >
                  {m.nombre}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {elegida && (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-horarios">
          <h2 id="titulo-horarios" className="text-lg font-semibold">
            Horarios de {elegida.nombre}
          </h2>
          {!diaElegido ? (
            <p className="text-muted-foreground">
              {elegida.nombre} no tiene horarios disponibles por ahora. Probá con otra maquilladora.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2" aria-label="Días con horarios libres">
                {dias.map((d) => (
                  <li key={d.fecha}>
                    <Link
                      href={`${base}&maquilladora=${elegida.id}&fecha=${d.fecha}`}
                      className={buttonVariants({ variant: d.fecha === diaElegido.fecha ? "default" : "outline", size: "sm" })}
                      aria-current={d.fecha === diaElegido.fecha ? "date" : undefined}
                    >
                      {fechaCorta(d.fecha)}
                    </Link>
                  </li>
                ))}
              </ul>
              <h3 className="font-medium capitalize">{fechaLarga(diaElegido.fecha)}</h3>
              <ul aria-label="Horarios libres" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {diaElegido.inicios.map((inicio) => {
                  const esElegido = inicioElegido?.getTime() === inicio.getTime();
                  return (
                    <li key={inicio.toISOString()}>
                      <Link
                        href={`${base}&maquilladora=${elegida.id}&fecha=${diaElegido.fecha}&inicio=${encodeURIComponent(inicio.toISOString())}`}
                        className={buttonVariants({ variant: esElegido ? "default" : "outline", className: "w-full" })}
                        aria-current={esElegido ? "true" : undefined}
                        aria-label={`Elegir el horario de las ${horaDe(inicio)}`}
                      >
                        {horaDe(inicio)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-muted-foreground">
                Horarios de Lima. Elegir uno no cambia nada: tu turno actual sigue igual hasta que confirmes.
              </p>
            </>
          )}
        </section>
      )}

      {!elegida && maquilladoras.length > 0 && (
        <p className="text-muted-foreground">Elegí una maquilladora para ver sus horarios.</p>
      )}

      {elegida && inicioElegido && (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-resumen">
          <h2 id="titulo-resumen" className="text-lg font-semibold">
            Resumen del cambio
          </h2>
          <p className="text-sm">
            De <span className="font-semibold capitalize">{cuando(turno.inicio)}</span> con {turno.maquilladora} a{" "}
            <span className="font-semibold capitalize">{cuando(inicioElegido)}</span> con {elegida.nombre}.
          </p>
          <FormularioReprogramacion
            accion={accion}
            volverA={volverA}
            cambio={{
              token,
              lineaId: turno.id,
              maquilladoraId: elegida.id,
              inicio: inicioElegido.toISOString(),
              inicioVisto: turno.inicio.toISOString(),
              maquilladoraVistaId: turno.maquilladoraId,
            }}
          />
        </section>
      )}
    </div>
  );
}
