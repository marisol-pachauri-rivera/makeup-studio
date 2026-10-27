import { z } from "zod";
import { MAX_INTEGRANTES } from "./grupo";

/**
 * Estado del asistente de reserva (ADR 0008): vive en el cliente con respaldo en `sessionStorage` y
 * no escribe nada en el servidor hasta confirmar. Los nombres y precios guardados son solo para
 * mostrar el resumen; el servidor reconstruye todo desde los identificadores y no confía en ellos.
 */

export const CLAVE_ALMACENAMIENTO = "reserva-asistente";

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const entero = z.number().int().positive();

const servicioSchema = z.object({ id: entero, nombre: z.string(), precio: z.string(), duracionMinutos: entero });
const maquilladoraSchema = z.object({ id: entero, nombre: z.string() });

/**
 * Una integrante del grupo. `id` es local y estable (no viaja al servidor) para poder quitarla o
 * editarla sin depender de su posición. Su servicio, maquilladora y horario se eligen juntos con el
 * catálogo y la disponibilidad; mientras no se elijan, la integrante está incompleta.
 */
const integranteSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  servicio: servicioSchema.optional(),
  maquilladora: maquilladoraSchema.optional(),
  inicio: z.iso.datetime().optional(),
});

const estadoSchema = z.object({
  version: z.literal(1),
  /**
   * Clave de idempotencia de este intento (ADR 0009). Identifica un CONTENIDO: cambia al elegir otro
   * horario y, en un grupo, al cambiar cualquier selección; reutilizarla con otro contenido
   * devolvería la reserva anterior.
   */
  clave: z.uuid(),
  servicio: servicioSchema,
  maquilladora: maquilladoraSchema,
  /** Instante UTC del horario elegido, ISO. */
  inicio: z.iso.datetime(),
  contacto: z.object({ nombre: z.string(), telefono: z.string() }),
  /**
   * Campos opcionales de la reserva grupal (agregados sin cambiar `version: 1`): un estado sin ellos es
   * la reserva individual de siempre. Un `personas` mal formado invalida TODO el estado.
   */
  personas: z.array(integranteSchema).optional(),
  /** La integrante cuyo horario se está eligiendo ahora, si hay una. */
  personaActiva: z.uuid().optional(),
});

export type EstadoAsistente = z.infer<typeof estadoSchema>;
export type Contacto = EstadoAsistente["contacto"];
export type Integrante = z.infer<typeof integranteSchema>;

export type Seleccion = Pick<EstadoAsistente, "servicio" | "maquilladora" | "inicio">;

/** `sessionStorage` del navegador, o `null` si no se puede usar (acceder a él puede lanzar). */
export function almacenDeSesion(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * El estado guardado, o `null` si no hay, está dañado, es de otra versión o el almacenamiento no está
 * disponible (navegación privada estricta): todos equivalen a "no hay una reserva en curso".
 */
export function leerAsistente(almacen: Almacen): EstadoAsistente | null {
  try {
    return analizarAsistente(almacen.getItem(CLAVE_ALMACENAMIENTO));
  } catch {
    return null;
  }
}

/** Interpreta el texto guardado; cualquier cosa que no sea un estado válido es `null`. */
export function analizarAsistente(crudo: string | null): EstadoAsistente | null {
  if (!crudo) return null;
  try {
    const estado = estadoSchema.safeParse(JSON.parse(crudo));
    return estado.success ? estado.data : null;
  } catch {
    return null;
  }
}

/** El texto guardado tal cual, o `null` si no hay o el almacenamiento no está disponible. */
export function leerAsistenteCrudo(almacen: Almacen | null): string | null {
  try {
    return almacen?.getItem(CLAVE_ALMACENAMIENTO) ?? null;
  } catch {
    return null;
  }
}

/** `false` si el almacenamiento rechazó la escritura. */
export function guardarAsistente(almacen: Almacen, estado: EstadoAsistente): boolean {
  try {
    almacen.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}

export function borrarAsistente(almacen: Almacen): void {
  try {
    almacen.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/**
 * Registra el horario elegido. Siempre genera una clave nueva (otro horario es otro intento) y
 * conserva el nombre y el teléfono que la clienta ya había escrito.
 */
export function iniciarSeleccion(
  almacen: Almacen,
  seleccion: Seleccion,
  generarClave: () => string = () => crypto.randomUUID(),
): EstadoAsistente {
  const contacto = leerAsistente(almacen)?.contacto ?? { nombre: "", telefono: "" };
  const estado: EstadoAsistente = { version: 1, clave: generarClave(), ...seleccion, contacto };
  guardarAsistente(almacen, estado);
  return estado;
}

/** Guarda lo que la clienta escribe, para que sobreviva a una recarga o a un choque de horario. */
export function actualizarContacto(almacen: Almacen, contacto: Contacto): void {
  const estado = leerAsistente(almacen);
  if (estado) guardarAsistente(almacen, { ...estado, contacto });
}

// --- Reserva grupal ------------------------------------------------------------------------------
// Todas reciben el almacén, devuelven el estado nuevo (o `null` si la operación no procede) y no
// lanzan. Cambiar lo que se reserva (activar, agregar, quitar, elegir horario) genera una clave nueva;
// renombrar o marcar la integrante activa no, porque no cambian lo reservado.

const nuevaClave = () => crypto.randomUUID();

export const esGrupo = (estado: EstadoAsistente): boolean => estado.personas !== undefined;

export const puedeAgregarIntegrante = (estado: EstadoAsistente): boolean =>
  (estado.personas?.length ?? 0) < MAX_INTEGRANTES;

/** Lo que le falta a una integrante para poder reservar. */
export type Faltante = "nombre" | "servicio" | "maquilladora" | "horario";
export type IntegranteIncompleta = { id: string; indice: number; falta: Faltante[] };

/** Las integrantes que todavía no pueden reservar, con qué les falta; vacío si el grupo está completo. */
export function integrantesIncompletas(estado: EstadoAsistente): IntegranteIncompleta[] {
  const incompletas: IntegranteIncompleta[] = [];
  (estado.personas ?? []).forEach((p, indice) => {
    const falta: Faltante[] = [];
    if (p.nombre.trim() === "") falta.push("nombre");
    if (!p.servicio) falta.push("servicio");
    if (!p.maquilladora) falta.push("maquilladora");
    if (!p.inicio) falta.push("horario");
    if (falta.length > 0) incompletas.push({ id: p.id, indice, falta });
  });
  return incompletas;
}

/**
 * Lo que viaja al servidor en el campo oculto `personas`, en el mismo orden. A una integrante
 * incompleta le faltan campos: el servidor la rechaza señalándola (y el botón ya está deshabilitado).
 */
export function personasParaEnviar(estado: EstadoAsistente) {
  return (estado.personas ?? []).map((p) => ({
    nombre: p.nombre,
    servicioId: p.servicio?.id,
    maquilladoraId: p.maquilladora?.id,
    inicio: p.inicio,
  }));
}

/** Aplica `cambio` a un estado de grupo y lo guarda; `null` si no hay un grupo o el cambio no procede. */
function modificarGrupo(
  almacen: Almacen,
  cambio: (estado: EstadoAsistente, personas: Integrante[]) => Partial<EstadoAsistente> | null,
  claveNueva: (() => string) | null,
): EstadoAsistente | null {
  const estado = leerAsistente(almacen);
  if (!estado?.personas) return null;
  const parcial = cambio(estado, estado.personas);
  if (!parcial) return null;
  const nuevo: EstadoAsistente = { ...estado, ...parcial, ...(claveNueva ? { clave: claveNueva() } : {}) };
  guardarAsistente(almacen, nuevo);
  return nuevo;
}

/**
 * Pasa a modo grupal: la primera integrante toma la selección actual y el nombre de contacto (después
 * son editables por separado). Si ya era un grupo, no cambia nada. `null` sin una selección guardada.
 */
export function activarGrupo(
  almacen: Almacen,
  generarClave: () => string = nuevaClave,
  generarId: () => string = nuevaClave,
): EstadoAsistente | null {
  const estado = leerAsistente(almacen);
  if (!estado) return null;
  if (estado.personas) return estado;
  const primera: Integrante = {
    id: generarId(),
    nombre: estado.contacto.nombre,
    servicio: estado.servicio,
    maquilladora: estado.maquilladora,
    inicio: estado.inicio,
  };
  const nuevo: EstadoAsistente = { ...estado, clave: generarClave(), personas: [primera] };
  guardarAsistente(almacen, nuevo);
  return nuevo;
}

/** Vuelve a la reserva individual, con la selección de la primera integrante si ya la tenía completa. */
export function volverAIndividual(almacen: Almacen, generarClave: () => string = nuevaClave): EstadoAsistente | null {
  const estado = leerAsistente(almacen);
  if (!estado) return null;
  const primera = estado.personas?.[0];
  const seleccion: Seleccion =
    primera?.servicio && primera.maquilladora && primera.inicio
      ? { servicio: primera.servicio, maquilladora: primera.maquilladora, inicio: primera.inicio }
      : { servicio: estado.servicio, maquilladora: estado.maquilladora, inicio: estado.inicio };
  // Sin `personas` ni `personaActiva`: es otra vez la reserva individual de siempre.
  const nuevo: EstadoAsistente = { version: 1, clave: generarClave(), ...seleccion, contacto: estado.contacto };
  guardarAsistente(almacen, nuevo);
  return nuevo;
}

/** Agrega una integrante vacía. `null` si el grupo ya tiene el máximo (el almacén no cambia). */
export function agregarIntegrante(
  almacen: Almacen,
  generarClave: () => string = nuevaClave,
  generarId: () => string = nuevaClave,
): EstadoAsistente | null {
  return modificarGrupo(
    almacen,
    (estado, personas) =>
      puedeAgregarIntegrante(estado) ? { personas: [...personas, { id: generarId(), nombre: "" }] } : null,
    generarClave,
  );
}

/** Quita una integrante y conserva a las demás. `null` si no existe o es la única que queda. */
export function quitarIntegrante(
  almacen: Almacen,
  id: string,
  generarClave: () => string = nuevaClave,
): EstadoAsistente | null {
  return modificarGrupo(
    almacen,
    (estado, personas) => {
      if (personas.length <= 1 || !personas.some((p) => p.id === id)) return null;
      return {
        personas: personas.filter((p) => p.id !== id),
        personaActiva: estado.personaActiva === id ? undefined : estado.personaActiva,
      };
    },
    generarClave,
  );
}

/** Cambia el nombre de una integrante. No genera clave nueva: no cambia lo que se reserva. */
export function renombrarIntegrante(almacen: Almacen, id: string, nombre: string): EstadoAsistente | null {
  return modificarGrupo(
    almacen,
    (_estado, personas) =>
      personas.some((p) => p.id === id) ? { personas: personas.map((p) => (p.id === id ? { ...p, nombre } : p)) } : null,
    null,
  );
}

/** Marca (o desmarca, con `undefined`) a la integrante cuyo horario se va a elegir. Sin clave nueva. */
export function marcarActiva(almacen: Almacen, id: string | undefined): EstadoAsistente | null {
  return modificarGrupo(
    almacen,
    (_estado, personas) => (id === undefined || personas.some((p) => p.id === id) ? { personaActiva: id } : null),
    null,
  );
}

/**
 * Asigna la selección a la integrante en edición y la deja de marcar, sin tocar a las demás ni a quien
 * reserva. `null` si no hay ninguna en edición (entonces el horario se trata como una reserva individual).
 */
export function elegirParaIntegrante(
  almacen: Almacen,
  seleccion: Seleccion,
  generarClave: () => string = nuevaClave,
): EstadoAsistente | null {
  return modificarGrupo(
    almacen,
    (estado, personas) => {
      const id = estado.personaActiva;
      if (!id || !personas.some((p) => p.id === id)) return null;
      return {
        personas: personas.map((p) => (p.id === id ? { ...p, ...seleccion } : p)),
        personaActiva: undefined,
      };
    },
    generarClave,
  );
}
