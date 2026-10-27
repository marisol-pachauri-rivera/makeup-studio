"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useSyncExternalStore } from "react";
import { CampoTexto } from "@/components/panel/campo-texto";
import { Button, buttonVariants } from "@/components/ui/button";
import { aPartesLocales } from "@/lib/agenda/zona-horaria";
import {
  activarGrupo,
  actualizarContacto,
  agregarIntegrante,
  almacenDeSesion,
  analizarAsistente,
  borrarAsistente,
  integrantesIncompletas,
  leerAsistenteCrudo,
  marcarActiva,
  personasParaEnviar,
  puedeAgregarIntegrante,
  quitarIntegrante,
  renombrarIntegrante,
  volverAIndividual,
  type Faltante,
  type Integrante,
} from "@/lib/reserva/asistente";
import { CAMPOS_DE_SELECCION, type EstadoConfirmacion, type ResultadoConfirmacion } from "@/lib/reserva/confirmacion";
import { MAX_NOMBRE } from "@/lib/reserva/esquemas";
import { MIN_INTEGRANTES, sumarPrecios } from "@/lib/reserva/grupo";
import { fechaLarga } from "./formato-fecha";
import { ListaIntegrantes } from "./lista-integrantes";

type Accion = (estado: EstadoConfirmacion, formData: FormData) => Promise<ResultadoConfirmacion>;

// `sessionStorage` no existe en el servidor: `undefined` marca "todavía no se pudo leer". El evento
// `storage` solo avisa de cambios de OTRA pestaña, así que los cambios de esta se avisan a mano.
const oyentes = new Set<() => void>();
const suscribir = (aviso: () => void) => {
  oyentes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    oyentes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
};
const avisarCambio = () => oyentes.forEach((aviso) => aviso());
const leerEnCliente = () => leerAsistenteCrudo(almacenDeSesion());
const leerEnServidor = () => undefined;

const alerta = "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

const FALTANTE: Record<Faltante, string> = {
  nombre: "el nombre",
  servicio: "el servicio",
  maquilladora: "la maquilladora",
  horario: "el horario",
};

/** Avisos por integrante a partir de lo que respondió el servidor (choques, solapamientos, errores). */
function avisosDelGrupo(resultado: EstadoConfirmacion, personas: readonly Integrante[]): Record<number, string[]> {
  const avisos: Record<number, string[]> = {};
  const agregar = (indice: number, mensaje: string) => {
    (avisos[indice] ??= []).push(mensaje);
  };
  const quien = (indice: number) => personas[indice]?.nombre.trim() || `la integrante ${indice + 1}`;

  if (resultado.estado === "grupo_rechazado") {
    for (const i of resultado.horariosNoDisponibles) agregar(i, "Ese horario ya no está disponible.");
    for (const i of resultado.noDisponibles) agregar(i, "Este servicio o maquilladora ya no están disponibles.");
    for (const [a, b] of resultado.solapamientos) {
      agregar(a, `Se solapa con ${quien(b)}: tienen a la misma maquilladora a la vez.`);
      agregar(b, `Se solapa con ${quien(a)}: tienen a la misma maquilladora a la vez.`);
    }
  }
  if (resultado.estado === "invalido") {
    for (const [ruta, mensaje] of Object.entries(resultado.errores)) {
      const m = /^personas\.(\d+)\./.exec(ruta);
      if (m) agregar(Number(m[1]), mensaje);
    }
  }
  return avisos;
}

/** Paso de confirmación: resumen de lo elegido, datos de contacto y la confirmación de la reserva. */
export function PasoConfirmacion({ accion }: { accion: Accion }) {
  const router = useRouter();
  const crudo = useSyncExternalStore(suscribir, leerEnCliente, leerEnServidor);
  const asistente = useMemo(() => (crudo === undefined ? null : analizarAsistente(crudo)), [crudo]);
  const [resultado, enviar, pendiente] = useActionState<EstadoConfirmacion, FormData>(accion, { estado: "inicial" });

  useEffect(() => {
    if (resultado.estado !== "ok") return;
    const almacen = almacenDeSesion();
    if (almacen) borrarAsistente(almacen);
    router.push(`/reservas/${resultado.token}`);
  }, [resultado, router]);

  if (crudo === undefined) return <p className="text-muted-foreground">Cargando…</p>;

  if (!asistente) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">No hay una reserva en curso. Elegí un servicio y un horario para empezar.</p>
        <Link href="/" className={buttonVariants()}>
          Ver servicios
        </Link>
      </div>
    );
  }

  const { servicio, maquilladora, inicio, contacto, clave } = asistente;
  const personas = asistente.personas;
  const esGrupo = personas !== undefined;
  const { fecha, hora } = aPartesLocales(new Date(inicio));
  const errores = resultado.estado === "invalido" ? resultado.errores : {};
  const valores = resultado.estado === "invalido" ? resultado.valores : {};
  const seleccionInvalida = !esGrupo && CAMPOS_DE_SELECCION.some((campo) => errores[campo]);
  const enlaceHorarios = `/servicios/${servicio.id}/disponibilidad?maquilladora=${maquilladora.id}`;

  const incompletas = esGrupo ? integrantesIncompletas(asistente) : [];
  const faltanIntegrantes = esGrupo && (personas?.length ?? 0) < MIN_INTEGRANTES;
  const grupoCompleto = esGrupo && incompletas.length === 0 && !faltanIntegrantes;
  const montoDelGrupo = grupoCompleto ? sumarPrecios((personas ?? []).map((p) => p.servicio?.precio ?? "0")) : undefined;
  const avisos = esGrupo ? avisosDelGrupo(resultado, personas ?? []) : {};
  const erroresDeLista = esGrupo ? [errores.personas, errores.clave].filter(Boolean) : [];

  /** Aplica un cambio al estado guardado y avisa para volver a dibujar. */
  function mutar(cambio: (almacen: NonNullable<ReturnType<typeof almacenDeSesion>>) => unknown) {
    const almacen = almacenDeSesion();
    if (almacen) cambio(almacen);
    avisarCambio();
  }

  function elegirHorarioDe(id: string) {
    mutar((a) => marcarActiva(a, id));
    const integrante = personas?.find((p) => p.id === id);
    // Con su misma maquilladora si ya tenía una (también tras un choque); si no, desde el catálogo.
    router.push(
      integrante?.servicio && integrante.maquilladora
        ? `/servicios/${integrante.servicio.id}/disponibilidad?maquilladora=${integrante.maquilladora.id}`
        : "/",
    );
  }

  function guardarLoEscrito(evento: React.ChangeEvent<HTMLFormElement>) {
    const datos = new FormData(evento.currentTarget);
    const almacen = almacenDeSesion();
    if (almacen) {
      actualizarContacto(almacen, {
        nombre: String(datos.get("nombre") ?? ""),
        telefono: String(datos.get("telefono") ?? ""),
      });
    }
  }

  const confirmando = pendiente || resultado.estado === "ok";

  return (
    <div className="flex flex-col gap-6">
      <label className="flex w-fit items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          role="switch"
          checked={esGrupo}
          onChange={(e) => mutar((a) => (e.target.checked ? activarGrupo(a) : volverAIndividual(a)))}
        />
        Reservar para un grupo
      </label>

      {esGrupo ? (
        <>
          <ListaIntegrantes
            integrantes={personas ?? []}
            personaActivaId={asistente.personaActiva}
            avisos={avisos}
            puedeAgregar={puedeAgregarIntegrante(asistente)}
            onRenombrar={(id, nombre) => mutar((a) => renombrarIntegrante(a, id, nombre))}
            onElegirHorario={elegirHorarioDe}
            onQuitar={(id) => mutar((a) => quitarIntegrante(a, id))}
            onAgregar={() => mutar((a) => agregarIntegrante(a))}
          />
          {montoDelGrupo !== undefined && (
            <p className="text-sm">
              <span className="text-muted-foreground">Monto total del grupo: </span>
              <span className="font-medium">{montoDelGrupo}</span>
            </p>
          )}
        </>
      ) : (
        <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
          <Dato titulo="Servicio" valor={servicio.nombre} />
          <Dato titulo="Maquilladora" valor={maquilladora.nombre} />
          <Dato titulo="Día" valor={fechaLarga(fecha)} capitalizar />
          <Dato titulo="Hora" valor={`${hora} (hora de Lima)`} />
          <Dato titulo="Duración" valor={`${servicio.duracionMinutos} min`} />
          <Dato titulo="Precio" valor={servicio.precio} />
        </dl>
      )}

      {resultado.estado === "horario_no_disponible" && (
        <div role="alert" className={`${alerta} flex flex-col gap-2`}>
          <p>Ese horario ya no está disponible: otra clienta lo reservó mientras completabas tus datos.</p>
          <Link href={enlaceHorarios} className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
            Elegir otro horario
          </Link>
        </div>
      )}
      {resultado.estado === "no_disponible" && (
        <div role="alert" className={`${alerta} flex flex-col gap-2`}>
          <p>Este servicio o esta maquilladora ya no están disponibles. Elegí de nuevo desde el inicio.</p>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
            Ver servicios
          </Link>
        </div>
      )}
      {resultado.estado === "grupo_rechazado" && (
        <p role="alert" className={alerta}>
          No se pudo crear el grupo y no se guardó nada. Revisá a las integrantes marcadas y elegí otro horario para ellas:
          las demás conservan lo que ya elegiste.
        </p>
      )}
      {erroresDeLista.map((mensaje) => (
        <p key={mensaje} role="alert" className={alerta}>
          {mensaje}
        </p>
      ))}
      {seleccionInvalida && (
        <div role="alert" className={`${alerta} flex flex-col gap-2`}>
          <p>La solicitud no es válida. Volvé a elegir el horario.</p>
          <Link href={enlaceHorarios} className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
            Elegir el horario
          </Link>
        </div>
      )}

      <form action={enviar} onChange={guardarLoEscrito} className="flex w-full max-w-lg flex-col gap-4" noValidate>
        <input type="hidden" name="clave" value={clave} />
        {esGrupo ? (
          <input type="hidden" name="personas" value={JSON.stringify(personasParaEnviar(asistente))} />
        ) : (
          <>
            <input type="hidden" name="servicioId" value={servicio.id} />
            <input type="hidden" name="maquilladoraId" value={maquilladora.id} />
            <input type="hidden" name="inicio" value={inicio} />
          </>
        )}

        <CampoTexto
          id="nombre"
          name="nombre"
          etiqueta={esGrupo ? "Tu nombre (quien reserva)" : "Tu nombre"}
          autoComplete="name"
          maxLength={MAX_NOMBRE}
          required
          defaultValue={valores.nombre ?? contacto.nombre}
          error={errores.nombre}
        />
        <CampoTexto
          id="telefono"
          name="telefono"
          etiqueta="Tu teléfono"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          ayuda="Para que el studio pueda contactarte si hace falta."
          defaultValue={valores.telefono ?? contacto.telefono}
          error={errores.telefono}
        />

        {esGrupo && !grupoCompleto && (
          <div id="faltantes" className="flex flex-col gap-1 text-sm text-muted-foreground">
            {faltanIntegrantes && (
              <p>
                Un grupo necesita al menos {MIN_INTEGRANTES} integrantes: agregá otra, o{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => mutar((a) => volverAIndividual(a))}
                >
                  volvé a la reserva individual
                </button>
                .
              </p>
            )}
            {incompletas.length > 0 && (
              <>
                <p>Para confirmar, completá:</p>
                <ul className="list-disc pl-5">
                  {incompletas.map((i) => (
                    <li key={i.id}>
                      Integrante {i.indice + 1}: {i.falta.map((f) => FALTANTE[f]).join(", ")}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div>
          <Button type="submit" disabled={confirmando || (esGrupo && !grupoCompleto)}>
            {confirmando ? "Confirmando…" : esGrupo ? "Confirmar reserva del grupo" : "Confirmar reserva"}
          </Button>
        </div>
      </form>

      {!esGrupo && (
        <Link href={enlaceHorarios} className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          Cambiar de horario
        </Link>
      )}
    </div>
  );
}

function Dato({ titulo, valor, capitalizar }: { titulo: string; valor: string; capitalizar?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className={`font-medium${capitalizar ? " capitalize" : ""}`}>{valor}</dd>
    </div>
  );
}
