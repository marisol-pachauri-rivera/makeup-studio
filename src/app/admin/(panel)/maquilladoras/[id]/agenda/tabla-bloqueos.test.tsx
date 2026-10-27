import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BloqueoListado } from "@/lib/agenda/bloqueos";
import { formatearLocal, TablaBloqueos } from "./tabla-bloqueos";

const bloqueo = (id: number, motivo: string, inicio: string, fin: string, pasado: boolean): BloqueoListado => ({
  id,
  maquilladoraId: 3,
  motivo,
  inicio: new Date(inicio),
  fin: new Date(fin),
  pasado,
});

describe("formatearLocal", () => {
  it("muestra el instante en hora de Lima con formato día/mes/año", () => {
    expect(formatearLocal(new Date("2026-12-24T14:00:00Z"))).toBe("24/12/2026 09:00");
  });
});

describe("TablaBloqueos", () => {
  it("sin bloqueos lo indica", () => {
    render(<TablaBloqueos bloqueos={[]} maquilladoraId={3} quitar={vi.fn()} />);
    expect(screen.getByText("No hay bloqueos cargados.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("muestra fechas locales, motivo y distingue vigente de pasado con texto", () => {
    render(
      <TablaBloqueos
        bloqueos={[
          bloqueo(1, "Vacaciones", "2026-12-24T14:00:00Z", "2026-12-26T14:00:00Z", false),
          bloqueo(2, "Capacitación", "2026-01-10T14:00:00Z", "2026-01-10T22:00:00Z", true),
        ]}
        maquilladoraId={3}
        quitar={vi.fn()}
      />,
    );

    const filas = screen.getAllByRole("row").slice(1);
    expect(within(filas[0]).getByText("24/12/2026 09:00")).toBeInTheDocument();
    expect(within(filas[0]).getByText("26/12/2026 09:00")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Vacaciones")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Vigente")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Pasado")).toBeInTheDocument();
    expect(within(filas[1]).queryByText("Vigente")).toBeNull();
  });

  it("mantiene el orden recibido (vigentes primero)", () => {
    render(
      <TablaBloqueos
        bloqueos={[
          bloqueo(1, "Futuro", "2026-12-24T14:00:00Z", "2026-12-25T14:00:00Z", false),
          bloqueo(2, "Antiguo", "2026-01-10T14:00:00Z", "2026-01-11T14:00:00Z", true),
        ]}
        maquilladoraId={3}
        quitar={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("row").slice(1).map((f) => within(f).getAllByRole("cell")[2].textContent)).toEqual([
      "Futuro",
      "Antiguo",
    ]);
  });

  it("cada fila tiene un botón Quitar con nombre propio que manda ambos identificadores", async () => {
    const quitar = vi.fn().mockResolvedValue(undefined);
    render(
      <TablaBloqueos
        bloqueos={[bloqueo(9, "Vacaciones", "2026-12-24T14:00:00Z", "2026-12-26T14:00:00Z", false)]}
        maquilladoraId={3}
        quitar={quitar}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Quitar bloqueo Vacaciones del 24/12/2026 09:00" }));

    expect(Object.fromEntries(quitar.mock.calls[0][0].entries())).toEqual({ maquilladoraId: "3", id: "9" });
  });
});
