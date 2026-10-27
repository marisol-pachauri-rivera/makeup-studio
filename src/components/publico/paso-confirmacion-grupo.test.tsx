import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activarGrupo,
  actualizarContacto,
  agregarIntegrante,
  CLAVE_ALMACENAMIENTO,
  elegirParaIntegrante,
  iniciarSeleccion,
  leerAsistente,
  marcarActiva,
  renombrarIntegrante,
  type Seleccion,
} from "@/lib/reserva/asistente";
import type { EstadoConfirmacion, ResultadoConfirmacion } from "@/lib/reserva/confirmacion";
import { PasoConfirmacion } from "./paso-confirmacion";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

type Accion = (estado: EstadoConfirmacion, datos: FormData) => Promise<ResultadoConfirmacion>;

const CLAVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const seleccion: Seleccion = {
  servicio: { id: 4, nombre: "Maquillaje social", precio: "350.50", duracionMinutos: 60 },
  maquilladora: { id: 2, nombre: "Lucía" },
  inicio: "2026-12-24T14:00:00.000Z", // jueves 24, 09:00 en Lima
};
const otra: Seleccion = {
  servicio: { id: 7, nombre: "Peinado", precio: "80.00", duracionMinutos: 30 },
  maquilladora: { id: 3, nombre: "Bea" },
  inicio: "2026-12-24T16:00:00.000Z", // 11:00 en Lima
};

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

const conSeleccion = () => {
  iniciarSeleccion(sessionStorage, seleccion, () => CLAVE);
  actualizarContacto(sessionStorage, { nombre: "Lucía Pérez", telefono: "999111222" });
};

/** Un grupo de `n` integrantes ya guardado: la primera con la selección inicial y las demás con `otra`. */
function conGrupo(n: number, { completas = true } = {}) {
  conSeleccion();
  activarGrupo(sessionStorage);
  for (let i = 1; i < n; i++) agregarIntegrante(sessionStorage);
  const personas = leerAsistente(sessionStorage)?.personas ?? [];
  personas.forEach((p, i) => {
    if (i === 0) return;
    if (!completas) return;
    renombrarIntegrante(sessionStorage, p.id, ["Ana", "Bea", "Carla", "Dani", "Eli"][i - 1] ?? `P${i}`);
    marcarActiva(sessionStorage, p.id);
    elegirParaIntegrante(sessionStorage, otra);
  });
}

const interruptor = () => screen.getByRole("switch", { name: "Reservar para un grupo" });
const confirmarGrupo = () => screen.getByRole("button", { name: "Confirmar reserva del grupo" });
const personasGuardadas = () => leerAsistente(sessionStorage)?.personas ?? [];

describe("activar y desactivar el modo grupal", () => {
  it("sin activarlo, el paso se comporta como la reserva individual de siempre", () => {
    conSeleccion();
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(interruptor()).not.toBeChecked();
    expect(screen.queryByText("Integrantes del grupo")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tu nombre")).toBeInTheDocument();
  });

  it("al activarlo muestra a la primera integrante con la selección actual y puede agregar otra", async () => {
    conSeleccion();
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(interruptor());

    expect(interruptor()).toBeChecked();
    expect(screen.getByText("Integrantes del grupo")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de la integrante 1")).toHaveValue("Lucía Pérez");
    expect(screen.getByText(/Maquillaje social/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar integrante" })).toBeEnabled();
    expect(personasGuardadas()).toHaveLength(1);
  });

  it("al desactivarlo vuelve a la reserva individual", async () => {
    conGrupo(2);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(interruptor());

    expect(interruptor()).not.toBeChecked();
    expect(screen.queryByText("Integrantes del grupo")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
    expect(leerAsistente(sessionStorage)?.personas).toBeUndefined();
  });
});

describe("armar el grupo", () => {
  it("una integrante agregada aparece incompleta y no se puede confirmar", async () => {
    conGrupo(1);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar integrante" }));

    expect(screen.getByLabelText("Nombre de la integrante 2")).toHaveValue("");
    expect(confirmarGrupo()).toBeDisabled();
    expect(screen.getByText("Para confirmar, completá:")).toBeInTheDocument();
    expect(screen.getByText("Integrante 2: el nombre, el servicio, la maquilladora, el horario")).toBeInTheDocument();
  });

  it("quitar a una integrante conserva a las demás", async () => {
    conGrupo(3);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Quitar a Ana" }));

    expect(screen.queryByDisplayValue("Ana")).toBeNull();
    expect(screen.getByDisplayValue("Bea")).toBeInTheDocument();
    // La primera integrante y quien reserva comparten nombre al inicio, pero son campos distintos.
    expect(screen.getByLabelText("Nombre de la integrante 1")).toHaveValue("Lucía Pérez");
    expect(personasGuardadas().map((p) => p.nombre)).toEqual(["Lucía Pérez", "Bea"]);
  });

  it("no deja agregar más de 10 integrantes y explica el límite", async () => {
    conGrupo(10);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByRole("button", { name: "Agregar integrante" })).toBeDisabled();
    expect(screen.getByText("Un grupo admite hasta 10 integrantes.")).toBeInTheDocument();
    expect(personasGuardadas()).toHaveLength(10);
  });

  it("con una sola integrante no se puede confirmar y se ofrece volver a la individual", async () => {
    conGrupo(1);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(confirmarGrupo()).toBeDisabled();
    expect(screen.getByText(/necesita al menos 2 integrantes/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "volvé a la reserva individual" }));
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
    expect(screen.queryByText("Integrantes del grupo")).toBeNull();
  });

  it("escribir el nombre de una integrante lo guarda y puede habilitar la confirmación", async () => {
    conGrupo(2, { completas: false });
    const p = personasGuardadas()[1];
    marcarActiva(sessionStorage, p.id);
    elegirParaIntegrante(sessionStorage, otra);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(confirmarGrupo()).toBeDisabled();
    expect(screen.getByText("Integrante 2: el nombre")).toBeInTheDocument();

    await userEvent.setup().type(screen.getByLabelText("Nombre de la integrante 2"), "Bea");

    expect(personasGuardadas()[1].nombre).toBe("Bea");
    expect(confirmarGrupo()).toBeEnabled();
  });

  it("el grupo completo habilita la confirmación y muestra el resumen y el monto total exacto", () => {
    conGrupo(2);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(confirmarGrupo()).toBeEnabled();
    expect(screen.queryByText("Para confirmar, completá:")).toBeNull();
    expect(screen.getByText("Monto total del grupo:")).toBeInTheDocument();
    expect(screen.getByText("430.50")).toBeInTheDocument();
    expect(screen.getByText(/Peinado/)).toBeInTheDocument();
    expect(screen.getByText(/a las 11:00 \(hora de Lima\)/)).toBeInTheDocument();
  });

  it("tras recargar muestra el mismo grupo con sus datos y horarios", () => {
    conGrupo(3);
    const { unmount } = render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    unmount();

    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByDisplayValue("Ana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bea")).toBeInTheDocument();
    expect(screen.getAllByText(/Peinado/)).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "Reservar para un grupo" })).toBeChecked();
  });
});

describe("elegir el horario de una integrante", () => {
  it("marca a la integrante y lleva al catálogo si todavía no tenía selección", async () => {
    conGrupo(2, { completas: false });
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Elegir horario de la integrante 2" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/");
    expect(leerAsistente(sessionStorage)?.personaActiva).toBe(personasGuardadas()[1].id);
  });

  it("si ya tenía selección lleva a la disponibilidad de su misma maquilladora", async () => {
    conGrupo(2);
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cambiar horario de Ana" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/servicios/7/disponibilidad?maquilladora=3");
    expect(leerAsistente(sessionStorage)?.personaActiva).toBe(personasGuardadas()[1].id);
  });
});

describe("confirmar el grupo", () => {
  it("manda el grupo en un campo oculto y no los campos de la reserva individual", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "horario_no_disponible" });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    const datos = accion.mock.calls[0][1];
    expect(datos.get("clave")).toBe(leerAsistente(sessionStorage)?.clave);
    expect(datos.get("nombre")).toBe("Lucía Pérez");
    expect(datos.get("telefono")).toBe("999111222");
    expect(JSON.parse(String(datos.get("personas")))).toEqual([
      { nombre: "Lucía Pérez", servicioId: 4, maquilladoraId: 2, inicio: "2026-12-24T14:00:00.000Z" },
      { nombre: "Ana", servicioId: 7, maquilladoraId: 3, inicio: "2026-12-24T16:00:00.000Z" },
    ]);
    expect(datos.has("servicioId")).toBe(false);
    expect(datos.has("maquilladoraId")).toBe(false);
    expect(datos.has("inicio")).toBe(false);
  });

  it("al crearse el grupo borra el estado, incluidas las integrantes, y va a la página de estado", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "ok", token: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10" });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/reservas/3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10"));
    expect(sessionStorage.getItem(CLAVE_ALMACENAMIENTO)).toBeNull();
  });

  it("después de reservar, volver atrás muestra que no hay una reserva en curso", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "ok", token: "tok" });
    const { unmount } = render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    unmount();

    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText(/No hay una reserva en curso/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar reserva/ })).toBeNull();
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    conGrupo(2);
    let terminar!: (r: ResultadoConfirmacion) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    expect(await screen.findByRole("button", { name: "Confirmando…" })).toBeDisabled();
    terminar({ estado: "grupo_rechazado", noDisponibles: [], horariosNoDisponibles: [1], solapamientos: [] });
    expect(await screen.findByRole("button", { name: "Confirmar reserva del grupo" })).toBeEnabled();
  });
});

describe("choque parcial", () => {
  it("marca solo a la integrante afectada, conserva a las demás y ofrece elegir otro horario", async () => {
    conGrupo(3);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "grupo_rechazado",
      noDisponibles: [],
      horariosNoDisponibles: [1],
      solapamientos: [],
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    expect(await screen.findByText(/No se pudo crear el grupo y no se guardó nada/)).toBeInTheDocument();
    expect(screen.getByText("Ese horario ya no está disponible.")).toBeInTheDocument();
    // Solo la segunda integrante (Ana) está marcada; las demás siguen con su horario.
    expect(screen.getByRole("button", { name: "Elegir otro horario de Ana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar horario de Bea" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de la integrante 1")).toHaveValue("Lucía Pérez");
    expect(personasGuardadas()).toHaveLength(3);
    expect(personasGuardadas().every((p) => p.inicio)).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("volver a elegir el horario de la afectada la lleva a su misma maquilladora y usa una clave nueva", async () => {
    conGrupo(2);
    const claveAntes = leerAsistente(sessionStorage)?.clave;
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "grupo_rechazado",
      noDisponibles: [],
      horariosNoDisponibles: [1],
      solapamientos: [],
    });
    render(<PasoConfirmacion accion={accion} />);
    const u = userEvent.setup();
    await u.click(confirmarGrupo());
    await u.click(await screen.findByRole("button", { name: "Elegir otro horario de Ana" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/servicios/7/disponibilidad?maquilladora=3");

    // En la disponibilidad la clienta elige otro horario para esa integrante.
    elegirParaIntegrante(sessionStorage, { ...otra, inicio: "2026-12-24T17:00:00.000Z" });
    const despues = leerAsistente(sessionStorage);
    expect(despues?.personas?.[1].inicio).toBe("2026-12-24T17:00:00.000Z");
    expect(despues?.personas?.[0].inicio).toBe(seleccion.inicio);
    expect(despues?.clave).not.toBe(claveAntes);
  });

  it("un servicio o una maquilladora ya no disponibles se marcan en su integrante", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "grupo_rechazado",
      noDisponibles: [1],
      horariosNoDisponibles: [],
      solapamientos: [],
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());
    expect(await screen.findByText("Este servicio o maquilladora ya no están disponibles.")).toBeInTheDocument();
  });

  it("un solapamiento marca a ambas integrantes con el nombre de la otra", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "grupo_rechazado",
      noDisponibles: [],
      horariosNoDisponibles: [],
      solapamientos: [[0, 1]],
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    expect(await screen.findByText(/Se solapa con Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Se solapa con Lucía Pérez/)).toBeInTheDocument();
    expect(personasGuardadas()).toHaveLength(2);
  });

  it("los errores de validación por integrante aparecen en la integrante correcta", async () => {
    conGrupo(3);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { "personas.2.nombre": "El nombre es obligatorio." },
      valores: { nombre: "Lucía Pérez", telefono: "999111222" },
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());

    const alertas = await screen.findAllByRole("alert");
    expect(alertas).toHaveLength(1);
    expect(within(alertas[0]).getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(alertas[0].closest("li")).toHaveTextContent("Nombre de la integrante 3");
  });

  it("un error de la lista completa (tamaño) se muestra como alerta general", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { personas: "Un grupo admite hasta 10 integrantes." },
      valores: {},
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());
    expect(await screen.findByText("Un grupo admite hasta 10 integrantes.", { selector: "p" })).toBeInTheDocument();
  });

  it("los errores del contacto de quien reserva se muestran junto a su campo", async () => {
    conGrupo(2);
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { telefono: "El teléfono no es válido." },
      valores: { nombre: "Lucía Pérez", telefono: "abc" },
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmarGrupo());
    expect(await screen.findByText("El teléfono no es válido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu teléfono")).toHaveValue("abc");
  });
});
