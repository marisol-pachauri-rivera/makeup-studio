import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EstadoDeReserva, LineaDeReserva } from "@/lib/reserva/estado";
import { EstadoDeReservaVista } from "./estado-de-reserva";

const linea = (extra: Partial<LineaDeReserva> = {}): LineaDeReserva => ({
  persona: "Ana",
  servicio: "Maquillaje social",
  maquilladora: "Lucía",
  inicio: new Date("2026-12-24T14:00:00Z"), // 09:00 en Lima
  fin: new Date("2026-12-24T15:00:00Z"),
  precio: "350.50",
  activa: true,
  ...extra,
});

const reserva = (lineas: LineaDeReserva[], extra: Partial<EstadoDeReserva> = {}): EstadoDeReserva => ({
  estado: "pendiente_pago",
  montoTotal: "550.60",
  creadaEn: new Date("2026-12-21T15:00:00Z"),
  plazoPagoHasta: null,
  motivoRechazo: null,
  estadoReembolso: "no_aplica",
  puedeCancelarHasta: null,
  motivoCancelacion: null,
  lineas,
  ...extra,
});

const turnos = () =>
  within(screen.getByRole("region", { name: /Tus? turnos?/ })).getAllByRole("listitem");

describe("página de estado de una reserva grupal", () => {
  const grupo = reserva([
    linea({ persona: "Ana" }),
    linea({
      persona: "Bea",
      servicio: "Artístico",
      maquilladora: "Carla",
      inicio: new Date("2026-12-24T15:00:00Z"),
      fin: new Date("2026-12-24T16:30:00Z"),
    }),
    linea({
      persona: "Dani",
      servicio: "Peinado",
      inicio: new Date("2026-12-24T16:00:00Z"),
      fin: new Date("2026-12-24T16:30:00Z"),
    }),
  ]);

  it("muestra un turno por integrante con su nombre, servicio, maquilladora, día y hora", () => {
    render(<EstadoDeReservaVista reserva={grupo} />);
    const filas = turnos();
    expect(filas).toHaveLength(3);
    expect(within(filas[0]).getByText(/Ana · con Lucía/)).toBeInTheDocument();
    expect(within(filas[0]).getByText("Maquillaje social")).toBeInTheDocument();
    expect(within(filas[0]).getByText("09:00 a 10:00 (hora de Lima)")).toBeInTheDocument();
    expect(within(filas[1]).getByText(/Bea · con Carla/)).toBeInTheDocument();
    expect(within(filas[1]).getByText("10:00 a 11:30 (hora de Lima)")).toBeInTheDocument();
    expect(within(filas[2]).getByText(/Dani · con Lucía/)).toBeInTheDocument();
  });

  it("usa el título en plural y aclara que el monto es el total del grupo", () => {
    render(<EstadoDeReservaVista reserva={grupo} />);
    expect(screen.getByRole("heading", { name: "Tus turnos" })).toBeInTheDocument();
    expect(screen.getByText("Monto total del grupo:")).toBeInTheDocument();
    expect(screen.getByText("550.60")).toBeInTheDocument();
  });

  it("muestra un único estado para todo el grupo", () => {
    render(<EstadoDeReservaVista reserva={grupo} />);
    expect(screen.getAllByText("Pendiente de pago")).toHaveLength(1);
  });

  it("muestra los turnos en el orden recibido (la lectura ya los ordena por inicio)", () => {
    render(<EstadoDeReservaVista reserva={grupo} />);
    expect(turnos().map((f) => f.textContent?.match(/Ana|Bea|Dani/)?.[0])).toEqual(["Ana", "Bea", "Dani"]);
  });

  it("dos integrantes con el mismo nombre y el mismo horario se muestran ambas, sin ocultar ni duplicar", () => {
    const homonimas = reserva([
      linea({ persona: "María", maquilladora: "Lucía" }),
      linea({ persona: "María", maquilladora: "Carla" }),
    ]);
    render(<EstadoDeReservaVista reserva={homonimas} />);
    const filas = turnos();
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText(/María · con Lucía/)).toBeInTheDocument();
    expect(within(filas[1]).getByText(/María · con Carla/)).toBeInTheDocument();
  });

  it("dos integrantes idénticas en todo se muestran las dos (no colisionan como elementos de lista)", () => {
    const identicas = reserva([linea({ persona: "María" }), linea({ persona: "María" })]);
    render(<EstadoDeReservaVista reserva={identicas} />);
    expect(turnos()).toHaveLength(2);
  });

  it("no muestra teléfono ni datos de contacto", () => {
    const { container } = render(<EstadoDeReservaVista reserva={grupo} />);
    expect(container).not.toHaveTextContent(/teléfono|999|operación/i);
  });

  it("una reserva cancelada también lista a todas las integrantes", () => {
    render(<EstadoDeReservaVista reserva={{ ...grupo, estado: "cancelada" }} />);
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    expect(turnos()).toHaveLength(3);
  });
});

describe("la reserva individual no cambia", () => {
  it("con un solo turno mantiene el título en singular y el monto sin 'del grupo'", () => {
    render(<EstadoDeReservaVista reserva={reserva([linea()], { montoTotal: "350.50" })} />);
    expect(screen.getByRole("heading", { name: "Tu turno" })).toBeInTheDocument();
    expect(screen.getByText("Monto total:")).toBeInTheDocument();
    expect(screen.queryByText(/del grupo/)).toBeNull();
    expect(screen.getByText("350.50")).toBeInTheDocument();
  });
});
