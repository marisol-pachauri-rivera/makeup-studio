import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnoReprogramable } from "@/lib/reprogramacion/turnos";
import { SeccionDeReprogramacion } from "./seccion-de-reprogramacion";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

const turno = (extra: Partial<TurnoReprogramable> = {}): TurnoReprogramable => ({
  id: 7,
  persona: "Lucía",
  servicio: "Peinado",
  maquilladora: "Ana",
  maquilladoraId: 1,
  inicio: new Date("2026-12-28T15:00:00Z"), // 10:00 en Lima
  fin: new Date("2026-12-28T16:00:00Z"),
  puedeReprogramar: true,
  ...extra,
});

describe("SeccionDeReprogramacion", () => {
  it("un turno reprogramable ofrece un enlace a la pantalla de ese turno", () => {
    render(<SeccionDeReprogramacion token={TOKEN} turnos={[turno()]} />);
    expect(screen.getByRole("link", { name: "Reprogramar el turno de Lucía" })).toHaveAttribute(
      "href",
      `/reservas/${TOKEN}/reprogramar?linea=7`,
    );
    expect(screen.getByText(/sin pagar de nuevo/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 \(hora de Lima\)/)).toBeInTheDocument();
  });

  it("con menos de 24 horas el acceso aparece deshabilitado y explica el plazo", () => {
    render(<SeccionDeReprogramacion token={TOKEN} turnos={[turno({ puedeReprogramar: false })]} />);
    expect(screen.getByRole("button", { name: "Reprogramar el turno de Lucía" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Reprogramar el turno/ })).toBeNull();
    expect(screen.getByText(/faltan menos de 24 horas.*Escribile al studio/)).toBeInTheDocument();
  });

  it("una reserva grupal ofrece un acceso por turno, cada uno con su propio plazo", () => {
    render(
      <SeccionDeReprogramacion
        token={TOKEN}
        turnos={[
          turno({ id: 7, persona: "Lucía", puedeReprogramar: false }),
          turno({ id: 8, persona: "Marta" }),
          turno({ id: 9, persona: "Rosa" }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("button", { name: /Lucía/ })).toBeDisabled();
    expect(within(items[1]).getByRole("link", { name: /Marta/ })).toHaveAttribute("href", `/reservas/${TOKEN}/reprogramar?linea=8`);
    expect(within(items[2]).getByRole("link", { name: /Rosa/ })).toHaveAttribute("href", `/reservas/${TOKEN}/reprogramar?linea=9`);
    expect(screen.getByText(/cada turno/)).toBeInTheDocument();
  });

  it("sin turnos reprogramables (reserva no confirmada) no muestra nada", () => {
    const { container } = render(<SeccionDeReprogramacion token={TOKEN} turnos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
