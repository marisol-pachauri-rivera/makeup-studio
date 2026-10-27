import { describe, expect, it } from "vitest";
import {
  activarGrupo,
  agregarIntegrante,
  CLAVE_ALMACENAMIENTO,
  actualizarContacto,
  elegirParaIntegrante,
  esGrupo,
  integrantesIncompletas,
  iniciarSeleccion,
  leerAsistente,
  marcarActiva,
  personasParaEnviar,
  puedeAgregarIntegrante,
  quitarIntegrante,
  renombrarIntegrante,
  volverAIndividual,
  type Seleccion,
} from "./asistente";
import { MAX_INTEGRANTES } from "./grupo";

class AlmacenFalso {
  datos = new Map<string, string>();
  getItem = (k: string) => this.datos.get(k) ?? null;
  setItem = (k: string, v: string) => void this.datos.set(k, v);
  removeItem = (k: string) => void this.datos.delete(k);
}

/** UUID v4 válidos y distintos, en orden, para que las pruebas sean deterministas. */
const uuids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

const seleccion: Seleccion = {
  servicio: { id: 4, nombre: "Social", precio: "350.50", duracionMinutos: 60 },
  maquilladora: { id: 2, nombre: "Lucía" },
  inicio: "2026-12-24T14:00:00.000Z",
};
const otra: Seleccion = {
  servicio: { id: 7, nombre: "Peinado", precio: "80.00", duracionMinutos: 30 },
  maquilladora: { id: 3, nombre: "Bea" },
  inicio: "2026-12-24T16:00:00.000Z",
};

/** Un almacén con una selección individual y la clave A. */
function conSeleccion() {
  const almacen = new AlmacenFalso();
  iniciarSeleccion(almacen, seleccion, () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  return almacen;
}

function conGrupo() {
  const almacen = conSeleccion();
  actualizarContacto(almacen, { nombre: "Lucía Pérez", telefono: "999111222" });
  const id = uuids();
  const estado = activarGrupo(almacen, id, id);
  if (!estado) throw new Error("grupo esperado");
  return { almacen, id };
}

const leer = (a: AlmacenFalso) => {
  const estado = leerAsistente(a);
  if (!estado) throw new Error("estado esperado");
  return estado;
};

describe("activar el grupo", () => {
  it("la primera integrante toma la selección actual y el nombre de contacto", () => {
    const { almacen } = conGrupo();
    const estado = leer(almacen);
    expect(esGrupo(estado)).toBe(true);
    expect(estado.personas).toHaveLength(1);
    expect(estado.personas?.[0]).toMatchObject({ nombre: "Lucía Pérez", ...seleccion });
  });

  it("genera una clave nueva (el grupo es otro contenido que la reserva individual)", () => {
    const almacen = conSeleccion();
    const antes = leer(almacen).clave;
    const id = uuids();
    expect(activarGrupo(almacen, id, id)?.clave).not.toBe(antes);
  });

  it("no cambia nada si ya era un grupo", () => {
    const { almacen } = conGrupo();
    const antes = leer(almacen);
    expect(activarGrupo(almacen)).toEqual(antes);
    expect(leer(almacen)).toEqual(antes);
  });

  it("devuelve null si no hay ninguna selección guardada", () => {
    expect(activarGrupo(new AlmacenFalso())).toBeNull();
  });

  it("el contacto y los nombres son editables por separado", () => {
    const { almacen } = conGrupo();
    const [primera] = leer(almacen).personas ?? [];
    renombrarIntegrante(almacen, primera.id, "Ana");
    expect(leer(almacen).contacto.nombre).toBe("Lucía Pérez");
    expect(leer(almacen).personas?.[0].nombre).toBe("Ana");
  });
});

describe("agregar y quitar integrantes", () => {
  it("agrega una integrante vacía e incompleta", () => {
    const { almacen, id } = conGrupo();
    const estado = agregarIntegrante(almacen, uuids(), id);
    expect(estado?.personas).toHaveLength(2);
    expect(estado?.personas?.[1]).toMatchObject({ nombre: "" });
    expect(estado?.personas?.[1].servicio).toBeUndefined();
  });

  it("acepta hasta 10 integrantes y rechaza la undécima sin tocar el almacén", () => {
    const { almacen, id } = conGrupo();
    for (let i = 1; i < MAX_INTEGRANTES; i++) expect(agregarIntegrante(almacen, uuids(), id)).not.toBeNull();
    expect(leer(almacen).personas).toHaveLength(MAX_INTEGRANTES);
    expect(puedeAgregarIntegrante(leer(almacen))).toBe(false);

    const antes = almacen.getItem(CLAVE_ALMACENAMIENTO);
    expect(agregarIntegrante(almacen)).toBeNull();
    expect(almacen.getItem(CLAVE_ALMACENAMIENTO)).toBe(antes);
  });

  it("agregar genera una clave nueva", () => {
    const { almacen, id } = conGrupo();
    const antes = leer(almacen).clave;
    expect(agregarIntegrante(almacen, uuids(), id)?.clave).not.toBe(antes);
  });

  it("quitar conserva a las demás con sus datos", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    agregarIntegrante(almacen, uuids(), id);
    const [a, b, c] = leer(almacen).personas ?? [];
    renombrarIntegrante(almacen, b.id, "Bea");
    renombrarIntegrante(almacen, c.id, "Carla");

    const estado = quitarIntegrante(almacen, b.id);

    expect(estado?.personas?.map((p) => p.nombre)).toEqual(["Lucía Pérez", "Carla"]);
    expect(estado?.personas?.[0].id).toBe(a.id);
  });

  it("quitar genera una clave nueva", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const antes = leer(almacen).clave;
    const [, b] = leer(almacen).personas ?? [];
    expect(quitarIntegrante(almacen, b.id)?.clave).not.toBe(antes);
  });

  it("no deja quitar a la única integrante ni a una que no existe", () => {
    const { almacen, id } = conGrupo();
    const [unica] = leer(almacen).personas ?? [];
    expect(quitarIntegrante(almacen, unica.id)).toBeNull();
    agregarIntegrante(almacen, uuids(), id);
    expect(quitarIntegrante(almacen, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(leer(almacen).personas).toHaveLength(2);
  });

  it("si se quita a la integrante en edición, deja de haber una en edición", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const [, b] = leer(almacen).personas ?? [];
    marcarActiva(almacen, b.id);
    expect(quitarIntegrante(almacen, b.id)?.personaActiva).toBeUndefined();
  });
});

describe("elegir el horario de una integrante", () => {
  it("asigna la selección solo a la integrante en edición y deja de marcarla", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    agregarIntegrante(almacen, uuids(), id);
    const [a, b, c] = leer(almacen).personas ?? [];
    marcarActiva(almacen, c.id);

    const estado = elegirParaIntegrante(almacen, otra);

    expect(estado?.personaActiva).toBeUndefined();
    expect(estado?.personas?.[2]).toMatchObject({ id: c.id, ...otra });
    expect(estado?.personas?.[0]).toMatchObject({ id: a.id, ...seleccion });
    expect(estado?.personas?.[1]).toEqual(b);
  });

  it("conserva a quien reserva", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    marcarActiva(almacen, (leer(almacen).personas ?? [])[1].id);
    expect(elegirParaIntegrante(almacen, otra)?.contacto).toEqual({ nombre: "Lucía Pérez", telefono: "999111222" });
  });

  it("reemplaza solo el horario de una integrante que ya tenía uno", () => {
    const { almacen } = conGrupo();
    const [a] = leer(almacen).personas ?? [];
    marcarActiva(almacen, a.id);
    expect(elegirParaIntegrante(almacen, otra)?.personas?.[0]).toMatchObject({ id: a.id, ...otra });
  });

  it("genera una clave nueva", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    marcarActiva(almacen, (leer(almacen).personas ?? [])[1].id);
    const antes = leer(almacen).clave;
    expect(elegirParaIntegrante(almacen, otra)?.clave).not.toBe(antes);
  });

  it("sin integrante en edición no hace nada (se trata como una reserva individual)", () => {
    const { almacen } = conGrupo();
    const antes = almacen.getItem(CLAVE_ALMACENAMIENTO);
    expect(elegirParaIntegrante(almacen, otra)).toBeNull();
    expect(almacen.getItem(CLAVE_ALMACENAMIENTO)).toBe(antes);
  });

  it("no marca como activa a una integrante que no existe", () => {
    const { almacen } = conGrupo();
    expect(marcarActiva(almacen, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("marcar a la integrante activa no genera clave nueva", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const antes = leer(almacen).clave;
    const [, b] = leer(almacen).personas ?? [];
    expect(marcarActiva(almacen, b.id)?.clave).toBe(antes);
    expect(marcarActiva(almacen, undefined)?.personaActiva).toBeUndefined();
  });
});

describe("renombrar no cambia lo que se reserva", () => {
  it("conserva la misma clave de idempotencia", () => {
    const { almacen } = conGrupo();
    const [a] = leer(almacen).personas ?? [];
    const antes = leer(almacen).clave;
    expect(renombrarIntegrante(almacen, a.id, "Otro nombre")?.clave).toBe(antes);
  });

  it("devuelve null si la integrante no existe", () => {
    const { almacen } = conGrupo();
    expect(renombrarIntegrante(almacen, "00000000-0000-4000-8000-0000000000ff", "X")).toBeNull();
  });
});

describe("integrantesIncompletas", () => {
  it("señala qué le falta a cada integrante", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const [, b] = leer(almacen).personas ?? [];

    expect(integrantesIncompletas(leer(almacen))).toEqual([
      { id: b.id, indice: 1, falta: ["nombre", "servicio", "maquilladora", "horario"] },
    ]);
  });

  it("un nombre solo con espacios cuenta como faltante", () => {
    const { almacen } = conGrupo();
    const [a] = leer(almacen).personas ?? [];
    renombrarIntegrante(almacen, a.id, "   ");
    expect(integrantesIncompletas(leer(almacen))).toEqual([{ id: a.id, indice: 0, falta: ["nombre"] }]);
  });

  it("queda vacío cuando todas están completas", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const [, b] = leer(almacen).personas ?? [];
    renombrarIntegrante(almacen, b.id, "Bea");
    marcarActiva(almacen, b.id);
    elegirParaIntegrante(almacen, otra);
    expect(integrantesIncompletas(leer(almacen))).toEqual([]);
  });

  it("una reserva individual no tiene integrantes incompletas", () => {
    expect(integrantesIncompletas(leer(conSeleccion()))).toEqual([]);
  });
});

describe("personasParaEnviar", () => {
  it("manda nombre, identificadores y horario de cada integrante, en orden, sin nombres ni precios", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const [, b] = leer(almacen).personas ?? [];
    renombrarIntegrante(almacen, b.id, "Bea");
    marcarActiva(almacen, b.id);
    elegirParaIntegrante(almacen, otra);

    expect(personasParaEnviar(leer(almacen))).toEqual([
      { nombre: "Lucía Pérez", servicioId: 4, maquilladoraId: 2, inicio: "2026-12-24T14:00:00.000Z" },
      { nombre: "Bea", servicioId: 7, maquilladoraId: 3, inicio: "2026-12-24T16:00:00.000Z" },
    ]);
  });

  it("deja sin campos a una integrante incompleta, para que el servidor la señale", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const json = JSON.parse(JSON.stringify(personasParaEnviar(leer(almacen))));
    expect(json[1]).toEqual({ nombre: "" });
  });
});

describe("volver a la reserva individual", () => {
  it("quita el grupo y conserva la selección de la primera integrante y el contacto", () => {
    const { almacen, id } = conGrupo();
    agregarIntegrante(almacen, uuids(), id);
    const [a] = leer(almacen).personas ?? [];
    marcarActiva(almacen, a.id);
    elegirParaIntegrante(almacen, otra);
    const antes = leer(almacen).clave;

    const estado = volverAIndividual(almacen);

    expect(estado?.personas).toBeUndefined();
    expect(estado?.personaActiva).toBeUndefined();
    expect(esGrupo(estado!)).toBe(false);
    expect(estado).toMatchObject({ ...otra, contacto: { nombre: "Lucía Pérez", telefono: "999111222" } });
    expect(estado?.clave).not.toBe(antes);
  });

  it("devuelve null si no hay estado", () => {
    expect(volverAIndividual(new AlmacenFalso())).toBeNull();
  });
});

describe("compatibilidad con el estado individual", () => {
  it("un estado individual guardado antes de este cambio se lee igual y no es un grupo", () => {
    const almacen = new AlmacenFalso();
    almacen.setItem(
      CLAVE_ALMACENAMIENTO,
      JSON.stringify({
        version: 1,
        clave: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ...seleccion,
        contacto: { nombre: "Ana", telefono: "999" },
      }),
    );
    const estado = leerAsistente(almacen);
    expect(estado).not.toBeNull();
    expect(esGrupo(estado!)).toBe(false);
    expect(estado?.personas).toBeUndefined();
  });

  it("las funciones de grupo no hacen nada sobre una reserva individual", () => {
    const almacen = conSeleccion();
    const antes = almacen.getItem(CLAVE_ALMACENAMIENTO);
    expect(agregarIntegrante(almacen)).toBeNull();
    expect(quitarIntegrante(almacen, "x")).toBeNull();
    expect(renombrarIntegrante(almacen, "x", "y")).toBeNull();
    expect(marcarActiva(almacen, undefined)).toBeNull();
    expect(elegirParaIntegrante(almacen, otra)).toBeNull();
    expect(almacen.getItem(CLAVE_ALMACENAMIENTO)).toBe(antes);
  });

  it("elegir un horario sin grupo reemplaza la selección individual como siempre", () => {
    const almacen = conSeleccion();
    const nuevo = iniciarSeleccion(almacen, otra);
    expect(nuevo).toMatchObject({ ...otra });
    expect(nuevo.personas).toBeUndefined();
  });
});

describe("personas dañado invalida todo el estado", () => {
  const guardarConPersonas = (personas: unknown, extra: Record<string, unknown> = {}) => {
    const almacen = new AlmacenFalso();
    almacen.setItem(
      CLAVE_ALMACENAMIENTO,
      JSON.stringify({
        version: 1,
        clave: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ...seleccion,
        contacto: { nombre: "", telefono: "" },
        personas,
        ...extra,
      }),
    );
    return almacen;
  };

  it.each([
    ["no es un arreglo", { a: 1 }],
    ["tiene un elemento sin id", [{ nombre: "Ana" }]],
    ["tiene un id que no es uuid", [{ id: "uno", nombre: "Ana" }]],
    ["tiene un nombre que no es texto", [{ id: "00000000-0000-4000-8000-000000000001", nombre: 5 }]],
    ["tiene un servicio mal formado", [{ id: "00000000-0000-4000-8000-000000000001", nombre: "A", servicio: { id: 0 } }]],
    ["tiene un horario inválido", [{ id: "00000000-0000-4000-8000-000000000001", nombre: "A", inicio: "mañana" }]],
  ])("si personas %s, se ignora todo el estado", (_caso, personas) => {
    expect(leerAsistente(guardarConPersonas(personas))).toBeNull();
  });

  it("una personaActiva que no es uuid también invalida el estado", () => {
    expect(
      leerAsistente(guardarConPersonas([{ id: "00000000-0000-4000-8000-000000000001", nombre: "A" }], { personaActiva: "x" })),
    ).toBeNull();
  });

  it("un grupo bien formado se lee", () => {
    const almacen = guardarConPersonas([{ id: "00000000-0000-4000-8000-000000000001", nombre: "Ana", ...seleccion }]);
    expect(leerAsistente(almacen)?.personas?.[0]).toMatchObject({ nombre: "Ana", ...seleccion });
  });
});
