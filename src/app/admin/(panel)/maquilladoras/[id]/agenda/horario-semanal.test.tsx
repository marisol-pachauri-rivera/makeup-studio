import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Horario } from "@/lib/agenda/horarios";
import { HorarioSemanal } from "./horario-semanal";

const tramo = (id: number, diaSemana: number, horaInicio: string, horaFin: string): Horario => ({
  id,
  maquilladoraId: 3,
  diaSemana,
  horaInicio,
  horaFin,
});

describe("HorarioSemanal", () => {
  it("muestra los siete días con el lunes primero y el domingo al final", () => {
    render(<HorarioSemanal horarios={[]} maquilladoraId={3} quitar={vi.fn()} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
  });

  it("indica que no trabaja en los días sin tramos", () => {
    render(<HorarioSemanal horarios={[tramo(1, 1, "09:00:00", "18:00:00")]} maquilladoraId={3} quitar={vi.fn()} />);
    expect(screen.getAllByText("No trabaja este día.")).toHaveLength(6);
  });

  it("muestra los dos tramos de un día en el orden recibido, sin segundos", () => {
    render(
      <HorarioSemanal
        horarios={[tramo(1, 2, "09:00:00", "13:00:00"), tramo(2, 2, "15:00:00", "19:00:00")]}
        maquilladoraId={3}
        quitar={vi.fn()}
      />,
    );
    const martes = screen.getByRole("heading", { name: "Martes" }).closest("li") as HTMLElement;
    expect(within(martes).getAllByText(/ a /).map((e) => e.textContent)).toEqual(["09:00 a 13:00", "15:00 a 19:00"]);
  });

  it("el domingo (0) aparece en su lugar, al final", () => {
    render(<HorarioSemanal horarios={[tramo(1, 0, "10:00:00", "14:00:00")]} maquilladoraId={3} quitar={vi.fn()} />);
    const domingo = screen.getByRole("heading", { name: "Domingo" }).closest("li") as HTMLElement;
    expect(within(domingo).getByText("10:00 a 14:00")).toBeInTheDocument();
  });

  it("cada tramo tiene un botón Quitar con nombre accesible propio que manda ambos identificadores", async () => {
    const quitar = vi.fn().mockResolvedValue(undefined);
    render(
      <HorarioSemanal
        horarios={[tramo(7, 2, "09:00:00", "13:00:00"), tramo(8, 3, "09:00:00", "13:00:00")]}
        maquilladoraId={3}
        quitar={quitar}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Quitar tramo de Martes de 09:00 a 13:00" }));

    expect(Object.fromEntries(quitar.mock.calls[0][0].entries())).toEqual({ maquilladoraId: "3", id: "7" });
    expect(screen.getByRole("button", { name: "Quitar tramo de Miércoles de 09:00 a 13:00" })).toBeInTheDocument();
  });
});
