import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actualizarContacto,
  CLAVE_ALMACENAMIENTO,
  iniciarSeleccion,
  leerAsistente,
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
  inicio: "2026-12-24T14:00:00.000Z", // 09:00 en Lima, jueves 24
};

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

const conSeleccion = () => iniciarSeleccion(sessionStorage, seleccion, () => CLAVE);
const confirmar = () => screen.getByRole("button", { name: "Confirmar reserva" });

describe("sin una reserva en curso", () => {
  it("lo indica y ofrece volver al catálogo", () => {
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText(/No hay una reserva en curso/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver servicios" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).toBeNull();
  });

  it("trata un estado dañado como si no hubiera nada", () => {
    sessionStorage.setItem(CLAVE_ALMACENAMIENTO, "{basura");
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText(/No hay una reserva en curso/)).toBeInTheDocument();
  });

  it("trata un estado de otra versión como si no hubiera nada", () => {
    sessionStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify({ version: 9 }));
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText(/No hay una reserva en curso/)).toBeInTheDocument();
  });
});

describe("resumen y datos de contacto", () => {
  it("muestra servicio, maquilladora, día, hora de Lima, duración y precio exacto", () => {
    conSeleccion();
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText("Maquillaje social")).toBeInTheDocument();
    expect(screen.getByText("Lucía")).toBeInTheDocument();
    expect(screen.getByText(/jueves.*24.*diciembre/i)).toBeInTheDocument();
    expect(screen.getByText("09:00 (hora de Lima)")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText("350.50")).toBeInTheDocument();
  });

  it("tras una recarga muestra lo mismo y lo que ya se había escrito", () => {
    conSeleccion();
    actualizarContacto(sessionStorage, { nombre: "Ana", telefono: "999111222" });

    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);

    expect(screen.getByText("Maquillaje social")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Tu teléfono")).toHaveValue("999111222");
  });

  it("guarda en sessionStorage lo que la clienta escribe", async () => {
    conSeleccion();
    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Tu nombre"), "Ana");
    await u.type(screen.getByLabelText("Tu teléfono"), "999");

    expect(leerAsistente(sessionStorage)?.contacto).toEqual({ nombre: "Ana", telefono: "999" });
  });

  it("manda al servidor la clave y los identificadores, y no los precios ni nombres guardados", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "horario_no_disponible" });
    render(<PasoConfirmacion accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Tu nombre"), "Ana");
    await u.type(screen.getByLabelText("Tu teléfono"), "999111222");
    await u.click(confirmar());

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({
      clave: CLAVE,
      servicioId: "4",
      maquilladoraId: "2",
      inicio: "2026-12-24T14:00:00.000Z",
      nombre: "Ana",
      telefono: "999111222",
    });
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    conSeleccion();
    let terminar!: (r: ResultadoConfirmacion) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    expect(await screen.findByRole("button", { name: "Confirmando…" })).toBeDisabled();

    terminar({ estado: "horario_no_disponible" });
    expect(await screen.findByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
  });

  it("un reenvío lleva la misma clave", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "horario_no_disponible" });
    render(<PasoConfirmacion accion={accion} />);
    const u = userEvent.setup();
    await u.click(confirmar());
    await u.click(await screen.findByRole("button", { name: "Confirmar reserva" }));

    expect(accion).toHaveBeenCalledTimes(2);
    expect(accion.mock.calls[0][1].get("clave")).toBe(CLAVE);
    expect(accion.mock.calls[1][1].get("clave")).toBe(CLAVE);
  });
});

describe("respuestas del servidor", () => {
  it("con datos inválidos muestra el error junto al campo, lo marca y conserva lo escrito", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { nombre: "El nombre es obligatorio.", telefono: "El teléfono no es válido." },
      valores: { nombre: "   ", telefono: "abc" },
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    expect(await screen.findByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("El teléfono no es válido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("   ");
    expect(screen.getByLabelText("Tu teléfono")).toHaveValue("abc");
    expect(push).not.toHaveBeenCalled();
  });

  it("si falla un campo de la selección pide volver a elegir el horario", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { inicio: "El horario no es válido." },
      valores: {},
    });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent("Volvé a elegir el horario");
    expect(screen.getByRole("link", { name: "Elegir el horario" })).toHaveAttribute(
      "href",
      "/servicios/4/disponibilidad?maquilladora=2",
    );
  });

  it("ante un choque de horario lo explica, ofrece los horarios de la misma maquilladora y conserva todo", async () => {
    conSeleccion();
    actualizarContacto(sessionStorage, { nombre: "Ana", telefono: "999111222" });
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "horario_no_disponible" });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese horario ya no está disponible");
    expect(screen.getByRole("link", { name: "Elegir otro horario" })).toHaveAttribute(
      "href",
      "/servicios/4/disponibilidad?maquilladora=2",
    );
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Tu teléfono")).toHaveValue("999111222");
    expect(leerAsistente(sessionStorage)).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("si el servicio o la maquilladora ya no están, manda al catálogo", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "no_disponible" });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent("ya no están disponibles");
    expect(screen.getAllByRole("link", { name: "Ver servicios" })[0]).toHaveAttribute("href", "/");
  });

  it("al crearse la reserva borra el estado y lleva a la página de estado", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "ok", token: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10" });
    render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/reservas/3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10"));
    expect(sessionStorage.getItem(CLAVE_ALMACENAMIENTO)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmando…" })).toBeDisabled();
  });

  it("después de reservar, volver atrás muestra que no hay una reserva en curso", async () => {
    conSeleccion();
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "ok", token: "tok" });
    const { unmount } = render(<PasoConfirmacion accion={accion} />);
    await userEvent.setup().click(confirmar());
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    unmount();

    render(<PasoConfirmacion accion={vi.fn<Accion>()} />);
    expect(screen.getByText(/No hay una reserva en curso/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).toBeNull();
  });
});
