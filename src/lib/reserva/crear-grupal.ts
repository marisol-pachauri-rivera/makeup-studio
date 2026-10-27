import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva } from "@/db/schema";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import {
  obtenerMaquilladoraActiva,
  obtenerServicioActivo,
  type ServicioPublico,
} from "@/lib/publico/catalogo";
import { tokenDeLaClave, RESTRICCION_CLAVE } from "./crear";
import { esChoqueDeHorario, leerErrorPg, UNICO } from "./errores-pg";
import type { SolicitudGrupal } from "./esquemas";
import { detectarSolapamientos, sumarPrecios } from "./grupo";
import { HorarioOcupado, insertarLineaLiberandoVencidas, type ValoresLinea } from "./vencimiento";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type ResultadoGrupo =
  /** `repetida`: la clave ya había creado este grupo y se devuelve sin crear otro. */
  | { estado: "creada"; token: string; repetida: boolean }
  /** Nada se guardó. Los números son posiciones en el arreglo `personas` que envió la clienta. */
  | {
      estado: "rechazada";
      /** Su servicio o su maquilladora no existen o fueron desactivados. */
      noDisponibles: number[];
      /** Su horario no se ofrece (ocupado, pasado, bloqueado, fuera de horario o de grilla). */
      horariosNoDisponibles: number[];
      /** Pares de integrantes que se pisan con la misma maquilladora dentro del grupo. */
      solapamientos: [number, number][];
    };

type Problemas = {
  noDisponibles: number[];
  horariosNoDisponibles: number[];
  solapamientos: [number, number][];
};

type Evaluacion = Problemas & {
  /** El servicio de cada integrante (posición = índice), `undefined` si ya no está disponible. */
  servicios: (ServicioPublico | undefined)[];
};

const hayProblemas = (p: Problemas) =>
  p.noDisponibles.length > 0 || p.horariosNoDisponibles.length > 0 || p.solapamientos.length > 0;

/**
 * Revalida el grupo con la disponibilidad real. Todo en serie y fuera de la transacción: son
 * lecturas que no deben retenerla, y lo que garantiza que nadie se quede con un horario ocupado es
 * la exclusión de Postgres. Acumula todos los problemas para informarlos juntos.
 */
async function evaluarGrupo(db: Db, personas: SolicitudGrupal["personas"], ahora: Date): Promise<Evaluacion> {
  // Catálogo: cada servicio y cada maquilladora distintos se consultan una sola vez.
  const servicios = new Map<number, ServicioPublico | undefined>();
  const maquilladoras = new Map<number, boolean>();
  for (const p of personas) {
    if (!servicios.has(p.servicioId)) servicios.set(p.servicioId, await obtenerServicioActivo(db, p.servicioId));
    if (!maquilladoras.has(p.maquilladoraId)) {
      maquilladoras.set(p.maquilladoraId, (await obtenerMaquilladoraActiva(db, p.maquilladoraId)) !== undefined);
    }
  }

  const noDisponibles: number[] = [];
  const validas: { indice: number; servicio: ServicioPublico }[] = [];
  const porIntegrante = personas.map((p, indice) => {
    const servicio = servicios.get(p.servicioId);
    if (!servicio || !maquilladoras.get(p.maquilladoraId)) {
      noDisponibles.push(indice);
      return undefined;
    }
    validas.push({ indice, servicio });
    return servicio;
  });

  const solapamientos = detectarSolapamientos(
    validas.map(({ indice, servicio }) => ({
      indice,
      maquilladoraId: personas[indice].maquilladoraId,
      inicio: personas[indice].inicio,
      fin: new Date(personas[indice].inicio.getTime() + servicio.duracionMinutos * 60_000),
    })),
  );

  // La disponibilidad solo depende de la maquilladora y de la duración: una consulta por cada par.
  const ofrecidos = new Map<string, Set<number>>();
  const horariosNoDisponibles: number[] = [];
  for (const { indice, servicio } of validas) {
    const { maquilladoraId, inicio } = personas[indice];
    const clavePar = `${maquilladoraId}:${servicio.duracionMinutos}`;
    if (!ofrecidos.has(clavePar)) {
      const dias = await consultarDisponibilidad(db, { servicio, maquilladoraId, ahora });
      ofrecidos.set(clavePar, new Set(dias.flatMap((d) => d.inicios.map((i) => i.getTime()))));
    }
    if (!ofrecidos.get(clavePar)?.has(inicio.getTime())) horariosNoDisponibles.push(indice);
  }

  return { servicios: porIntegrante, noDisponibles, horariosNoDisponibles, solapamientos };
}

/**
 * Inserta la línea de una integrante. Es el único punto donde el grupo toca el vencimiento lazy
 * (ADR 0003): si el horario lo ocupa una reserva vencida, la cancela y reintenta dentro de la
 * transacción del grupo. Se aplica a CADA línea y, si alguna no entra, `HorarioOcupado` deshace el
 * grupo completo, incluidas las cancelaciones por vencimiento hechas para líneas anteriores: no se
 * cancela a nadie por un grupo que no llegó a crearse.
 */
async function insertarLinea(tx: Db, linea: ValoresLinea, ahora: Date): Promise<void> {
  if ((await insertarLineaLiberandoVencidas(tx, linea, ahora)) === "ocupado") throw new HorarioOcupado();
}

/**
 * Crea una reserva grupal `pendiente_pago`: una sola reserva con N líneas, todo o nada (ADR 0005 y
 * 0009). Un solo token, un solo estado y un monto total igual a la suma exacta de los precios.
 *
 * - Una clave que ya creó un grupo lo devuelve sin revalidar nada: es suyo.
 * - Si algo no se ofrece, informa qué integrantes lo impiden, todos juntos, y no toca la base. Antes
 *   de rechazar vuelve a buscar la clave: otro envío con la misma clave pudo confirmar mientras tanto.
 * - La transacción solo tiene los inserts, en serie. Anota qué integrante se está insertando para
 *   poder señalarla si falla; `23P01` y `40P01` son el mismo "horario ya no disponible".
 */
export async function crearReservaGrupal(db: Db, solicitud: SolicitudGrupal, ahora: Date): Promise<ResultadoGrupo> {
  const existente = await tokenDeLaClave(db, solicitud.clave);
  if (existente) return { estado: "creada", token: existente, repetida: true };

  const evaluacion = await evaluarGrupo(db, solicitud.personas, ahora);
  if (hayProblemas(evaluacion)) {
    const token = await tokenDeLaClave(db, solicitud.clave);
    if (token) return { estado: "creada", token, repetida: true };
    const { noDisponibles, horariosNoDisponibles, solapamientos } = evaluacion;
    return { estado: "rechazada", noDisponibles, horariosNoDisponibles, solapamientos };
  }

  // Sin problemas, todos los servicios existen.
  const servicios = evaluacion.servicios as ServicioPublico[];
  const montoTotal = sumarPrecios(servicios.map((s) => s.precio));
  let integranteEnCurso = -1;

  try {
    return await db.transaction(async (tx): Promise<ResultadoGrupo> => {
      const [creada] = await tx
        .insert(reserva)
        .values({
          nombreContacto: solicitud.nombre,
          telefonoContacto: solicitud.telefono,
          montoTotal,
          claveIdempotencia: solicitud.clave,
          // Con el reloj inyectado, no con el `now()` de la base: el vencimiento usa un solo reloj.
          creadaEn: ahora,
        })
        .returning({ id: reserva.id, token: reserva.token });

      for (const [indice, persona] of solicitud.personas.entries()) {
        integranteEnCurso = indice;
        const servicio = servicios[indice];
        await insertarLinea(
          tx,
          {
            reservaId: creada.id,
            persona: persona.nombre,
            servicioId: servicio.id,
            maquilladoraId: persona.maquilladoraId,
            inicio: persona.inicio,
            fin: new Date(persona.inicio.getTime() + servicio.duracionMinutos * 60_000),
            precio: servicio.precio,
          },
          ahora,
        );
      }
      return { estado: "creada", token: creada.token, repetida: false };
    });
  } catch (error) {
    const { codigo, restriccion } = leerErrorPg(error);
    const claveRepetida = codigo === UNICO && restriccion === RESTRICCION_CLAVE;
    const choque = error instanceof HorarioOcupado || esChoqueDeHorario(error);
    if (!claveRepetida && !choque) throw error;

    const token = await tokenDeLaClave(db, solicitud.clave);
    if (token) return { estado: "creada", token, repetida: true };
    if (claveRepetida) throw error;

    // Choque con otra clienta durante la creación: se repite la revalidación para señalar a todas las
    // integrantes afectadas, y siempre a la que falló (la carrera pudo cambiar lo que se ve ahora).
    const ahoraAfectadas = await evaluarGrupo(db, solicitud.personas, ahora);
    const horarios = new Set(ahoraAfectadas.horariosNoDisponibles);
    if (integranteEnCurso >= 0 && !ahoraAfectadas.noDisponibles.includes(integranteEnCurso)) {
      horarios.add(integranteEnCurso);
    }
    return {
      estado: "rechazada",
      noDisponibles: ahoraAfectadas.noDisponibles,
      horariosNoDisponibles: [...horarios].sort((a, b) => a - b),
      solapamientos: ahoraAfectadas.solapamientos,
    };
  }
}
