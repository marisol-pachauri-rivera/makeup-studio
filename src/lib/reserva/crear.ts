import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { reserva } from "@/db/schema";
import { consultarDisponibilidad } from "@/lib/disponibilidad/consulta";
import { obtenerMaquilladoraActiva, obtenerServicioActivo } from "@/lib/publico/catalogo";
import { esChoqueDeHorario, leerErrorPg, UNICO } from "./errores-pg";
import type { SolicitudReserva } from "./esquemas";
import { HorarioOcupado, insertarLineaLiberandoVencidas } from "./vencimiento";

// Acepta tanto el driver de Neon (producción) como node-postgres (tests).
type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type ResultadoReserva =
  /** `repetida`: la clave ya había creado esta reserva y se devuelve sin crear otra. */
  | { estado: "creada"; token: string; repetida: boolean }
  /** Otra clienta lo tomó, o nunca se ofreció (pasado, ocupado, bloqueado, fuera de horario o de grilla). */
  | { estado: "horario_no_disponible" }
  /** El servicio o la maquilladora no existen o fueron desactivados. */
  | { estado: "no_disponible" };

export const RESTRICCION_CLAVE = "reserva_clave_idempotencia_unica";

export async function tokenDeLaClave(db: Db, clave: string): Promise<string | undefined> {
  const [fila] = await db.select({ token: reserva.token }).from(reserva).where(eq(reserva.claveIdempotencia, clave));
  return fila?.token;
}

/**
 * Crea una reserva individual `pendiente_pago` con su línea, todo en una transacción (ADR 0009).
 *
 * - Una clave que ya creó una reserva devuelve esa reserva sin revalidar nada: es suya, aunque su
 *   horario ya no figure entre los que se ofrecen.
 * - El servidor revalida con la misma disponibilidad que ve la clienta; la restricción de exclusión
 *   de Postgres sigue siendo la garantía final frente a la carrera entre esa lectura y el insert.
 *   La transacción solo cubre los dos inserts: o quedan la reserva y su línea, o ninguna.
 * - Si el choque es con una reserva vencida (ADR 0003), se cancela y se reintenta dentro de la misma
 *   transacción (`insertarLineaLiberandoVencidas`); si algo vigente ocupa el horario, se deshace todo.
 * - `23P01` (exclusión) y `40P01` (bloqueo mutuo que Postgres puede devolverle al perdedor) son el
 *   mismo "horario ya no disponible". Antes se busca la clave: si otro envío con la misma clave ganó,
 *   se devuelve su reserva. Cualquier otro error se relanza.
 */
export async function crearReservaIndividual(
  db: Db,
  solicitud: SolicitudReserva,
  ahora: Date,
): Promise<ResultadoReserva> {
  const existente = await tokenDeLaClave(db, solicitud.clave);
  if (existente) return { estado: "creada", token: existente, repetida: true };

  // La revalidación va fuera de la transacción: son lecturas en paralelo (un cliente de transacción no
  // admite consultas simultáneas) y no hace falta retener la transacción mientras se hacen. Lo que
  // garantiza que nadie se quede con un horario ocupado es la exclusión de Postgres al insertar.
  const [servicio, maquilladora] = await Promise.all([
    obtenerServicioActivo(db, solicitud.servicioId),
    obtenerMaquilladoraActiva(db, solicitud.maquilladoraId),
  ]);
  if (!servicio || !maquilladora) return { estado: "no_disponible" };

  const dias = await consultarDisponibilidad(db, { servicio, maquilladoraId: maquilladora.id, ahora });
  const instante = solicitud.inicio.getTime();
  if (!dias.some((d) => d.inicios.some((i) => i.getTime() === instante))) {
    // Otro envío con esta misma clave pudo confirmar mientras tanto: el horario ya no se ofrece
    // justamente porque es suyo, y eso no es un choque con otra clienta.
    const token = await tokenDeLaClave(db, solicitud.clave);
    return token ? { estado: "creada", token, repetida: true } : { estado: "horario_no_disponible" };
  }

  try {
    return await db.transaction(async (tx): Promise<ResultadoReserva> => {
      const [creada] = await tx
        .insert(reserva)
        .values({
          nombreContacto: solicitud.nombre,
          telefonoContacto: solicitud.telefono,
          montoTotal: servicio.precio,
          claveIdempotencia: solicitud.clave,
          // Con el reloj inyectado, no con el `now()` de la base: el vencimiento usa un solo reloj.
          creadaEn: ahora,
        })
        .returning({ id: reserva.id, token: reserva.token });

      // Si el horario lo ocupa una reserva vencida, la cancela y reintenta aquí mismo (ADR 0003).
      const insercion = await insertarLineaLiberandoVencidas(
        tx,
        {
          reservaId: creada.id,
          persona: solicitud.nombre,
          servicioId: servicio.id,
          maquilladoraId: maquilladora.id,
          inicio: solicitud.inicio,
          fin: new Date(instante + servicio.duracionMinutos * 60_000),
          precio: servicio.precio,
        },
        ahora,
      );
      // Algo vigente sigue ocupando: se deshace todo, también las vencidas ya canceladas.
      if (insercion === "ocupado") throw new HorarioOcupado();

      return { estado: "creada", token: creada.token, repetida: false };
    });
  } catch (error) {
    if (error instanceof HorarioOcupado) return { estado: "horario_no_disponible" };
    const { codigo, restriccion } = leerErrorPg(error);
    const claveRepetida = codigo === UNICO && restriccion === RESTRICCION_CLAVE;
    if (!claveRepetida && !esChoqueDeHorario(error)) throw error;

    const token = await tokenDeLaClave(db, solicitud.clave);
    if (token) return { estado: "creada", token, repetida: true };
    if (claveRepetida) throw error;
    return { estado: "horario_no_disponible" };
  }
}
