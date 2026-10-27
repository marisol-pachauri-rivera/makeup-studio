import { describe, expect, it } from "vitest";
import {
  actualizarContacto,
  borrarAsistente,
  CLAVE_ALMACENAMIENTO,
  guardarAsistente,
  iniciarSeleccion,
  leerAsistente,
  type EstadoAsistente,
  type Seleccion,
} from "./asistente";

class AlmacenFalso {
  datos = new Map<string, string>();
  getItem = (k: string) => this.datos.get(k) ?? null;
  setItem = (k: string, v: string) => void this.datos.set(k, v);
  removeItem = (k: string) => void this.datos.delete(k);
}

const bloqueado = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const seleccion: Seleccion = {
  servicio: { id: 4, nombre: "Maquillaje social", precio: "350.50", duracionMinutos: 60 },
  maquilladora: { id: 2, nombre: "Lucía" },
  inicio: "2026-12-24T14:00:00.000Z",
};

const CLAVE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLAVE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const estado = (extra: Partial<EstadoAsistente> = {}): EstadoAsistente => ({
  version: 1,
  clave: CLAVE_A,
  ...seleccion,
  contacto: { nombre: "", telefono: "" },
  ...extra,
});

describe("guardar y leer", () => {
  it("devuelve lo que se guardó", () => {
    const almacen = new AlmacenFalso();
    expect(guardarAsistente(almacen, estado({ contacto: { nombre: "Ana", telefono: "999" } }))).toBe(true);
    expect(leerAsistente(almacen)).toEqual(estado({ contacto: { nombre: "Ana", telefono: "999" } }));
  });

  it("devuelve null si no hay nada guardado", () => {
    expect(leerAsistente(new AlmacenFalso())).toBeNull();
  });

  it("ignora JSON inválido", () => {
    const almacen = new AlmacenFalso();
    almacen.setItem(CLAVE_ALMACENAMIENTO, "{no es json");
    expect(leerAsistente(almacen)).toBeNull();
  });

  it("ignora otra versión", () => {
    const almacen = new AlmacenFalso();
    almacen.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify({ ...estado(), version: 2 }));
    expect(leerAsistente(almacen)).toBeNull();
  });

  it.each([
    ["sin servicio", { servicio: undefined }],
    ["clave que no es uuid", { clave: "abc" }],
    ["servicio con id inválido", { servicio: { id: 0, nombre: "x", precio: "1.00", duracionMinutos: 60 } }],
    ["horario que no es un instante", { inicio: "mañana" }],
    ["contacto ausente", { contacto: undefined }],
  ])("ignora un estado %s", (_caso, cambio) => {
    const almacen = new AlmacenFalso();
    almacen.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify({ ...estado(), ...cambio }));
    expect(leerAsistente(almacen)).toBeNull();
  });

  it("ignora un valor que no es un objeto", () => {
    const almacen = new AlmacenFalso();
    for (const crudo of ["null", "42", '"texto"', "[]"]) {
      almacen.setItem(CLAVE_ALMACENAMIENTO, crudo);
      expect(leerAsistente(almacen)).toBeNull();
    }
  });
});

describe("almacenamiento no disponible", () => {
  it("leer devuelve null en lugar de lanzar", () => {
    expect(leerAsistente(bloqueado)).toBeNull();
  });

  it("guardar informa false en lugar de lanzar", () => {
    expect(guardarAsistente(bloqueado, estado())).toBe(false);
  });

  it("borrar no lanza", () => {
    expect(() => borrarAsistente(bloqueado)).not.toThrow();
  });

  it("iniciar la selección no lanza y devuelve el estado igual", () => {
    expect(iniciarSeleccion(bloqueado, seleccion, () => CLAVE_A)).toEqual(estado());
  });
});

describe("iniciarSeleccion", () => {
  it("guarda la selección con una clave y el contacto vacío", () => {
    const almacen = new AlmacenFalso();
    const nuevo = iniciarSeleccion(almacen, seleccion, () => CLAVE_A);
    expect(nuevo).toEqual(estado());
    expect(leerAsistente(almacen)).toEqual(nuevo);
  });

  it("genera una clave nueva cada vez", () => {
    const almacen = new AlmacenFalso();
    const a = iniciarSeleccion(almacen, seleccion);
    const b = iniciarSeleccion(almacen, seleccion);
    expect(a.clave).not.toBe(b.clave);
    expect(a.clave).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("otro horario cambia la clave y el horario", () => {
    const almacen = new AlmacenFalso();
    iniciarSeleccion(almacen, seleccion, () => CLAVE_A);
    const otro = iniciarSeleccion(almacen, { ...seleccion, inicio: "2026-12-24T15:00:00.000Z" }, () => CLAVE_B);
    expect(otro).toMatchObject({ clave: CLAVE_B, inicio: "2026-12-24T15:00:00.000Z" });
  });

  it("conserva el nombre y el teléfono ya escritos", () => {
    const almacen = new AlmacenFalso();
    iniciarSeleccion(almacen, seleccion, () => CLAVE_A);
    actualizarContacto(almacen, { nombre: "Ana", telefono: "999111222" });

    const otro = iniciarSeleccion(almacen, { ...seleccion, inicio: "2026-12-24T15:00:00.000Z" }, () => CLAVE_B);
    expect(otro.contacto).toEqual({ nombre: "Ana", telefono: "999111222" });
  });

  it("empieza con el contacto vacío si lo guardado estaba dañado", () => {
    const almacen = new AlmacenFalso();
    almacen.setItem(CLAVE_ALMACENAMIENTO, "basura");
    expect(iniciarSeleccion(almacen, seleccion, () => CLAVE_A).contacto).toEqual({ nombre: "", telefono: "" });
  });
});

describe("actualizarContacto", () => {
  it("guarda lo escrito sin tocar la clave ni la selección", () => {
    const almacen = new AlmacenFalso();
    iniciarSeleccion(almacen, seleccion, () => CLAVE_A);
    actualizarContacto(almacen, { nombre: "Ana", telefono: "999" });
    expect(leerAsistente(almacen)).toEqual(estado({ contacto: { nombre: "Ana", telefono: "999" } }));
  });

  it("no crea un estado si no había selección", () => {
    const almacen = new AlmacenFalso();
    actualizarContacto(almacen, { nombre: "Ana", telefono: "999" });
    expect(leerAsistente(almacen)).toBeNull();
  });
});

describe("borrarAsistente", () => {
  it("deja el almacenamiento sin estado", () => {
    const almacen = new AlmacenFalso();
    iniciarSeleccion(almacen, seleccion);
    borrarAsistente(almacen);
    expect(leerAsistente(almacen)).toBeNull();
    expect(almacen.datos.size).toBe(0);
  });
});
