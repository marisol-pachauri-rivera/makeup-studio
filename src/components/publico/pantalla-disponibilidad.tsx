import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { DiaConHuecos } from "@/lib/disponibilidad/huecos";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import type { MaquilladoraPublica, ServicioPublico } from "@/lib/publico/catalogo";
import { fechaCorta, fechaLarga } from "./formato-fecha";
import { HorarioElegible } from "./horario-elegible";

type Props = {
  servicio: ServicioPublico;
  maquilladoras: readonly MaquilladoraPublica[];
  /** La maquilladora elegida; `undefined` si todavía no eligió (el sistema nunca elige por ella). */
  elegida?: MaquilladoraPublica;
  /** Días con turnos libres de la elegida. */
  dias: readonly DiaConHuecos[];
  /** El día que se muestra (ya resuelto con `elegirDia`). */
  diaElegido?: DiaConHuecos;
};

const base = (servicioId: number) => `/servicios/${servicioId}/disponibilidad`;

function SelectorMaquilladora({ servicio, maquilladoras, elegida }: Pick<Props, "servicio" | "maquilladoras" | "elegida">) {
  if (maquilladoras.length === 0) {
    return <p className="text-muted-foreground">Por ahora no hay maquilladoras disponibles.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {maquilladoras.map((m) => (
        <li key={m.id}>
          <Link
            href={`${base(servicio.id)}?maquilladora=${m.id}`}
            className={buttonVariants({ variant: m.id === elegida?.id ? "default" : "outline" })}
            aria-current={m.id === elegida?.id ? "true" : undefined}
          >
            {m.nombre}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SelectorDia({ servicio, elegida, dias, diaElegido }: Required<Pick<Props, "elegida" | "diaElegido">> & Pick<Props, "servicio" | "dias">) {
  return (
    <ul className="flex flex-wrap gap-2">
      {dias.map((d) => (
        <li key={d.fecha}>
          <Link
            href={`${base(servicio.id)}?maquilladora=${elegida.id}&fecha=${d.fecha}`}
            className={buttonVariants({ variant: d.fecha === diaElegido.fecha ? "default" : "outline", size: "sm" })}
            aria-current={d.fecha === diaElegido.fecha ? "date" : undefined}
          >
            {fechaCorta(d.fecha)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pantalla de disponibilidad: elegir un horario inicia el asistente de reserva (`/reservar`). */
export function PantallaDisponibilidad({ servicio, maquilladoras, elegida, dias, diaElegido }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Volver al catálogo
        </Link>
        <h1 className="text-2xl font-semibold">{servicio.nombre}</h1>
        <p className="text-sm text-muted-foreground">
          {servicio.precio} · {servicio.duracionMinutos} min
        </p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-maquilladora">
        <h2 id="titulo-maquilladora" className="text-lg font-semibold">
          Elegí una maquilladora
        </h2>
        <SelectorMaquilladora servicio={servicio} maquilladoras={maquilladoras} elegida={elegida} />
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
              <SelectorDia servicio={servicio} elegida={elegida} dias={dias} diaElegido={diaElegido} />
              <h3 className="font-medium capitalize">{fechaLarga(diaElegido.fecha)}</h3>
              <ul aria-label="Horarios libres" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {diaElegido.inicios.map((inicio) => (
                  <li key={inicio.toISOString()}>
                    <HorarioElegible
                      servicio={{
                        id: servicio.id,
                        nombre: servicio.nombre,
                        precio: servicio.precio,
                        duracionMinutos: servicio.duracionMinutos,
                      }}
                      maquilladora={{ id: elegida.id, nombre: elegida.nombre }}
                      inicio={inicio.toISOString()}
                      hora={aPartesLocales(inicio).hora}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Horarios de Lima. Elegí uno para continuar: todavía no queda reservado hasta que confirmes.
              </p>
            </>
          )}
        </section>
      )}

      {!elegida && maquilladoras.length > 0 && (
        <p className="text-muted-foreground">Elegí una maquilladora para ver sus horarios.</p>
      )}
    </div>
  );
}
