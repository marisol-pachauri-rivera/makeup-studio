import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activarGrupo,
  actualizarContacto,
  agregarIntegrante,
  iniciarSeleccion,
  leerAsistente,
  marcarActiva,
  type Seleccion,
} from "@/lib/reserva/asistente";
import { HorarioElegible } from "./horario-elegible";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const inicial: Seleccion = {
  servicio: { id: 4, nombre: "Maquillaje social", precio: "350.50", duracionMinutos: 60 },
  maquilladora: { id: 2, nombre: "Lucía" },
  inicio: "2026-12-24T14:00:00.000Z",
};
const servicio = { id: 7, nombre: "Peinado", precio: "80.00", duracionMinutos: 30 };
const maquilladora = { id: 3, nombre: "Bea" };

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

/** Un grupo de tres integrantes guardado, con la integrante `activa` (0-2) en edición, si se indica. */
function conGrupo(activa?: number) {
  iniciarSeleccion(sessionStorage, inicial);
  actualizarContacto(sessionStorage, { nombre: "Lucía Pérez", telefono: "999111222" });
  activarGrupo(sessionStorage);
  agregarIntegrante(sessionStorage);
  agregarIntegrante(sessionStorage);
  if (activa !== undefined) marcarActiva(sessionStorage, (leerAsistente(sessionStorage)?.personas ?? [])[activa].id);
  return leerAsistente(sessionStorage)!;
}

const dibujar = (inicio = "2026-12-24T16:00:00.000Z", hora = "11:00") => {
  render(<HorarioElegible servicio={servicio} maquilladora={maquilladora} inicio={inicio} hora={hora} />);
  return screen.getByRole("button", { name: `Elegir el horario de las ${hora}` });
};

describe("HorarioElegible con una integrante en edición", () => {
  it("asigna el horario a esa integrante, conserva a las demás y a quien reserva, y vuelve a /reservar", async () => {
    const antes = conGrupo(2);
    await userEvent.setup().click(dibujar());

    const despues = leerAsistente(sessionStorage)!;
    expect(despues.personas?.[2]).toMatchObject({ servicio, maquilladora, inicio: "2026-12-24T16:00:00.000Z" });
    expect(despues.personas?.[0]).toEqual(antes.personas?.[0]);
    expect(despues.personas?.[1]).toEqual(antes.personas?.[1]);
    expect(despues.contacto).toEqual({ nombre: "Lucía Pérez", telefono: "999111222" });
    expect(despues.personaActiva).toBeUndefined();
    expect(push).toHaveBeenCalledExactlyOnceWith("/reservar");
  });

  it("no reemplaza la selección de las otras integrantes", async () => {
    conGrupo(1);
    await userEvent.setup().click(dibujar());
    const personas = leerAsistente(sessionStorage)!.personas!;
    expect(personas[0]).toMatchObject({ servicio: inicial.servicio, inicio: inicial.inicio });
    expect(personas[1]).toMatchObject({ servicio, inicio: "2026-12-24T16:00:00.000Z" });
    expect(personas[2].servicio).toBeUndefined();
  });

  it("cambiar el horario de una integrante que ya tenía uno reemplaza solo el suyo", async () => {
    conGrupo(0);
    await userEvent.setup().click(dibujar("2026-12-24T17:00:00.000Z", "12:00"));
    const personas = leerAsistente(sessionStorage)!.personas!;
    expect(personas[0]).toMatchObject({ servicio, inicio: "2026-12-24T17:00:00.000Z" });
    expect(personas).toHaveLength(3);
  });

  it("el nuevo horario usa una clave de idempotencia distinta", async () => {
    const antes = conGrupo(2);
    await userEvent.setup().click(dibujar());
    expect(leerAsistente(sessionStorage)!.clave).not.toBe(antes.clave);
  });
});

describe("HorarioElegible sin integrante en edición", () => {
  it("con un grupo armado pero sin nadie en edición se comporta como la reserva individual de siempre", async () => {
    conGrupo();
    await userEvent.setup().click(dibujar());
    const estado = leerAsistente(sessionStorage)!;
    expect(estado).toMatchObject({ servicio, maquilladora, inicio: "2026-12-24T16:00:00.000Z" });
    expect(estado.personas).toBeUndefined();
    expect(push).toHaveBeenCalledExactlyOnceWith("/reservar");
  });

  it("sin grupo guarda la selección individual y conserva el contacto escrito", async () => {
    iniciarSeleccion(sessionStorage, inicial);
    actualizarContacto(sessionStorage, { nombre: "Ana", telefono: "999" });
    await userEvent.setup().click(dibujar());
    expect(leerAsistente(sessionStorage)).toMatchObject({ servicio, contacto: { nombre: "Ana", telefono: "999" } });
  });
});
