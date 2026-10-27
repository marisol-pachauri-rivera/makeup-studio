import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EstadoDeReserva } from "@/lib/reserva/estado";
import { vi } from "vitest";
import { EstadoDeReservaVista, type DatosDeCancelacion } from "./estado-de-reserva";

const reserva = (extra: Partial<EstadoDeReserva> = {}): EstadoDeReserva => ({
  estado: "pendiente_pago",
  montoTotal: "350.50",
  creadaEn: new Date("2026-12-21T15:00:00Z"),
  plazoPagoHasta: null,
  motivoRechazo: null,
  estadoReembolso: "no_aplica",
  puedeCancelarHasta: null,
  motivoCancelacion: null,
  lineas: [
    {
      persona: "Ana Gómez",
      servicio: "Maquillaje social",
      maquilladora: "Lucía",
      inicio: new Date("2026-12-24T14:00:00Z"), // 09:00 en Lima
      fin: new Date("2026-12-24T15:00:00Z"),
      precio: "350.50",
      activa: true,
    },
  ],
  ...extra,
});

describe("EstadoDeReservaVista", () => {
  it("muestra servicio, persona, maquilladora, día, horario de Lima y monto exacto", () => {
    render(<EstadoDeReservaVista reserva={reserva()} />);
    expect(screen.getByText("Maquillaje social")).toBeInTheDocument();
    expect(screen.getByText(/Ana Gómez · con Lucía/)).toBeInTheDocument();
    expect(screen.getByText(/jueves.*24.*diciembre/i)).toBeInTheDocument();
    expect(screen.getByText("09:00 a 10:00 (hora de Lima)")).toBeInTheDocument();
    expect(screen.getByText("350.50")).toBeInTheDocument();
  });

  it.each([
    ["pendiente_pago", "Pendiente de pago", /horario está apartado.*completar el pago/i],
    ["pendiente_validacion", "Pendiente de validación", /studio está revisando tu pago/i],
    ["confirmada", "Confirmada", /reserva está confirmada/i],
    ["cancelada", "Cancelada", /fue cancelada/i],
  ] as const)("explica el estado %s con una etiqueta y un texto", (estado, etiqueta, explicacion) => {
    render(<EstadoDeReservaVista reserva={reserva({ estado })} />);
    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    expect(screen.getByText(explicacion)).toBeInTheDocument();
  });

  it("el estado se dice con palabras, no solo con color", () => {
    render(<EstadoDeReservaVista reserva={reserva({ estado: "confirmada" })} />);
    const seccion = screen.getByRole("region", { name: "Estado de tu reserva" });
    expect(within(seccion).getByText("Confirmada")).toBeInTheDocument();
  });

  it("avisa que guarde el enlace", () => {
    render(<EstadoDeReservaVista reserva={reserva()} />);
    expect(screen.getByText(/Guardá este enlace/)).toBeInTheDocument();
  });

  it("no muestra teléfono ni número de operación", () => {
    const { container } = render(<EstadoDeReservaVista reserva={reserva()} />);
    expect(container).not.toHaveTextContent(/teléfono|operación|999/i);
  });

  it("es de solo lectura: no hay formularios ni botones", () => {
    const { container } = render(<EstadoDeReservaVista reserva={reserva()} />);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("lista una línea por persona en el orden recibido", () => {
    const base = reserva().lineas[0];
    render(
      <EstadoDeReservaVista
        reserva={reserva({
          lineas: [
            { ...base, persona: "Primera" },
            { ...base, persona: "Segunda", inicio: new Date("2026-12-24T15:00:00Z"), fin: new Date("2026-12-24T16:00:00Z") },
          ],
        })}
      />,
    );
    expect(screen.getAllByText(/· con Lucía/).map((e) => e.textContent)).toEqual(["Primera · con Lucía", "Segunda · con Lucía"]);
  });
});

describe("cancelación y reembolso en la página de estado", () => {
  const LIMITE = new Date("2026-12-23T14:00:00Z");
  const cancelacion = (ahora = new Date("2026-12-21T15:00:00Z")): DatosDeCancelacion => ({
    token: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
    accion: vi.fn(),
    ahora,
  });
  const hayCancelar = () => screen.queryByRole("button", { name: "Cancelar reserva" }) !== null;

  it.each(["pendiente_pago", "pendiente_validacion", "confirmada"] as const)(
    "una reserva %s ofrece cancelar mientras falte el plazo",
    (estado) => {
      render(<EstadoDeReservaVista reserva={reserva({ estado, puedeCancelarHasta: LIMITE })} cancelacion={cancelacion()} />);
      expect(hayCancelar()).toBe(true);
      expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeEnabled();
    },
  );

  it("pasado el plazo muestra el botón deshabilitado y dice que escriba al studio", () => {
    render(
      <EstadoDeReservaVista
        reserva={reserva({ estado: "confirmada", puedeCancelarHasta: LIMITE })}
        cancelacion={cancelacion(new Date("2026-12-23T14:00:01Z"))}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeDisabled();
    expect(screen.getByText(/Escribile al studio/)).toBeInTheDocument();
  });

  it("sin los datos de cancelación o sin plazo no se muestra el control", () => {
    const { unmount } = render(<EstadoDeReservaVista reserva={reserva({ puedeCancelarHasta: LIMITE })} />);
    expect(hayCancelar()).toBe(false);
    unmount();
    render(<EstadoDeReservaVista reserva={reserva({ puedeCancelarHasta: null })} cancelacion={cancelacion()} />);
    expect(hayCancelar()).toBe(false);
  });

  it("una reserva cancelada no ofrece cancelar", () => {
    render(
      <EstadoDeReservaVista
        reserva={reserva({ estado: "cancelada", motivoCancelacion: "clienta", puedeCancelarHasta: null })}
        cancelacion={cancelacion()}
      />,
    );
    expect(hayCancelar()).toBe(false);
  });

  it.each([
    ["pendiente", /gestiona la devolución de 350\.50.*pendiente/],
    ["realizado", /ya realizó la devolución/],
    ["no_aplica", /No hay pago que devolver/],
  ] as const)("cancelada por la clienta con reembolso %s explica el reembolso", (estadoReembolso, texto) => {
    render(
      <EstadoDeReservaVista
        reserva={reserva({ estado: "cancelada", motivoCancelacion: "clienta", estadoReembolso })}
        cancelacion={cancelacion()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Reembolso" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Reembolso" })).toHaveTextContent(texto);
  });

  it.each(["vencida", "studio"] as const)("cancelada por %s no muestra el texto de reembolso de la clienta", (motivoCancelacion) => {
    render(<EstadoDeReservaVista reserva={reserva({ estado: "cancelada", motivoCancelacion })} />);
    expect(screen.queryByRole("heading", { name: "Reembolso" })).toBeNull();
  });
});
