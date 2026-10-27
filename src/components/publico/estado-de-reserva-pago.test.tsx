import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EstadoDeReserva } from "@/lib/reserva/estado";
import { EstadoDeReservaVista } from "./estado-de-reserva";
import type { DatosDePago } from "./seccion-de-pago";

const CREADA = new Date("2026-12-21T15:00:00Z"); // 10:00 en Lima

const reserva = (extra: Partial<EstadoDeReserva> = {}): EstadoDeReserva => ({
  estado: "pendiente_pago",
  montoTotal: "350.50",
  creadaEn: CREADA,
  plazoPagoHasta: new Date(CREADA.getTime() + 20 * 60_000),
  motivoRechazo: null,
  estadoReembolso: "no_aplica",
  puedeCancelarHasta: null,
  motivoCancelacion: null,
  lineas: [
    {
      persona: "Ana Gómez",
      servicio: "Maquillaje social",
      maquilladora: "Lucía",
      inicio: new Date("2026-12-24T14:00:00Z"),
      fin: new Date("2026-12-24T15:00:00Z"),
      precio: "350.50",
      activa: true,
    },
  ],
  ...extra,
});

const pago: DatosDePago = {
  token: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
  configuracion: { qrUrl: "https://cdn.ejemplo.pe/qr.png", billetera: "Yape" },
  accion: vi.fn(),
  ahora: new Date(CREADA.getTime() + 3 * 60_000),
};

const seccionDePago = () => within(screen.getByRole("region", { name: "Pagá tu reserva" }));
const hayPago = () => screen.queryByRole("heading", { name: "Pagá tu reserva" }) !== null;

describe("la sección de pago en la página de estado", () => {
  it("una reserva pendiente de pago ofrece pagar: QR, monto, plazo y campo del número", () => {
    render(<EstadoDeReservaVista reserva={reserva()} pago={pago} />);
    expect(hayPago()).toBe(true);
    expect(screen.getByRole("img", { name: /Código QR para pagar con Yape/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Número de operación")).toBeInTheDocument();
    expect(screen.getByText(/Tenés 20 minutos/)).toBeInTheDocument();
    expect(seccionDePago().getByText("350.50")).toBeInTheDocument();
  });

  it("sigue explicando que el horario está apartado y que falta el pago", () => {
    render(<EstadoDeReservaVista reserva={reserva()} pago={pago} />);
    expect(screen.getByText(/horario está apartado.*completar el pago/i)).toBeInTheDocument();
  });

  it("una reserva devuelta por un rechazo ofrece pagar sin mostrar plazo", () => {
    render(<EstadoDeReservaVista reserva={reserva({ plazoPagoHasta: null })} pago={pago} />);
    expect(hayPago()).toBe(true);
    expect(screen.queryByText(/Tenés 20 minutos/)).toBeNull();
  });

  it("un grupo muestra el monto total del grupo para pagar", () => {
    render(<EstadoDeReservaVista reserva={reserva({ montoTotal: "550.60" })} pago={pago} />);
    expect(seccionDePago().getByText("550.60")).toBeInTheDocument();
  });

  it("sin los datos de pago no se muestra la sección", () => {
    render(<EstadoDeReservaVista reserva={reserva()} />);
    expect(hayPago()).toBe(false);
  });

  it.each([
    ["pendiente_validacion", {}],
    ["confirmada", {}],
    ["cancelada", { motivoCancelacion: "studio" as const }],
  ] as const)("una reserva %s no muestra el QR ni el campo para ingresar un número", (estado, extra) => {
    render(<EstadoDeReservaVista reserva={reserva({ estado, plazoPagoHasta: null, ...extra })} pago={pago} />);
    expect(hayPago()).toBe(false);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
  });

  it("sin el QR configurado lo dice y no ofrece el campo", () => {
    render(<EstadoDeReservaVista reserva={reserva()} pago={{ ...pago, configuracion: null }} />);
    expect(screen.getByText(/El pago por QR todavía no está disponible/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
  });

  it("no muestra el teléfono ni un número ya informado", () => {
    const { container } = render(<EstadoDeReservaVista reserva={reserva()} pago={pago} />);
    expect(container).not.toHaveTextContent(/teléfono|999/i);
  });
});

describe("reserva cancelada por vencimiento", () => {
  const vencida = reserva({ estado: "cancelada", motivoCancelacion: "vencida", plazoPagoHasta: null });

  it("explica que venció y ofrece elegir otro horario", () => {
    render(<EstadoDeReservaVista reserva={vencida} pago={pago} />);
    expect(screen.getByText(/Tu reserva venció: pasaron 20 minutos sin pago y otra clienta tomó el horario/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Elegir otro horario" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
  });

  it("no ofrece pagar una reserva vencida", () => {
    render(<EstadoDeReservaVista reserva={vencida} pago={pago} />);
    expect(hayPago()).toBe(false);
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
  });

  it.each(["studio", "clienta"] as const)("una cancelación por %s mantiene el texto genérico y sin enlace", (motivo) => {
    render(<EstadoDeReservaVista reserva={reserva({ estado: "cancelada", motivoCancelacion: motivo, plazoPagoHasta: null })} pago={pago} />);
    expect(screen.getByText("Esta reserva fue cancelada.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Elegir otro horario" })).toBeNull();
    expect(screen.queryByText(/venció/)).toBeNull();
  });
});

describe("el motivo del rechazo en la página de estado", () => {
  it("una reserva rechazada muestra el motivo junto al campo del número, sin plazo", () => {
    render(<EstadoDeReservaVista reserva={reserva({ plazoPagoHasta: null, motivoRechazo: "no coincide con ningún movimiento" })} pago={pago} />);
    expect(seccionDePago().getByRole("status")).toHaveTextContent("no coincide con ningún movimiento");
    expect(seccionDePago().getByLabelText("Número de operación")).toBeInTheDocument();
    expect(screen.queryByText(/Tenés 20 minutos/)).toBeNull();
  });

  it("una reserva que nunca fue rechazada no muestra ningún motivo", () => {
    render(<EstadoDeReservaVista reserva={reserva()} pago={pago} />);
    expect(screen.queryByText(/no pudo validar tu pago/)).toBeNull();
  });

  it("una reserva que volvió a validación (número nuevo) ya no muestra el motivo", () => {
    render(<EstadoDeReservaVista reserva={reserva({ estado: "pendiente_validacion", plazoPagoHasta: null, motivoRechazo: null })} pago={pago} />);
    expect(screen.queryByText(/no pudo validar tu pago/)).toBeNull();
  });
});
