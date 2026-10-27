import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoAgenda } from "@/lib/agenda/formularios";
import { FormularioHorario } from "./formulario-horario";

type Accion = (estado: EstadoAgenda, datos: FormData) => Promise<EstadoAgenda>;

describe("FormularioHorario", () => {
  it("ofrece los siete días con el lunes primero y el domingo al final", () => {
    render(<FormularioHorario accion={vi.fn<Accion>()} maquilladoraId={3} />);
    const dias = within(screen.getByLabelText("Día")).getAllByRole("option").map((o) => o.textContent);
    expect(dias).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(screen.getByLabelText("Día")).toHaveValue("1");
  });

  it("manda la maquilladora en un campo oculto y las horas como campos de hora", () => {
    const { container } = render(<FormularioHorario accion={vi.fn<Accion>()} maquilladoraId={3} />);
    expect(container.querySelector('input[name="maquilladoraId"]')).toHaveValue("3");
    expect(screen.getByLabelText("Desde")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("type", "time");
  });

  it("envía lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ exito: "Tramo agregado." });
    render(<FormularioHorario accion={accion} maquilladoraId={3} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Día"), "Sábado");
    await u.type(screen.getByLabelText("Desde"), "09:00");
    await u.type(screen.getByLabelText("Hasta"), "13:00");
    await u.click(screen.getByRole("button", { name: "Agregar tramo" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({
      maquilladoraId: "3",
      diaSemana: "6",
      horaInicio: "09:00",
      horaFin: "13:00",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Tramo agregado.");
  });

  it("con errores los muestra junto a cada campo y conserva lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      errores: { horaFin: "La hora de fin debe ser posterior a la de inicio." },
      valores: { diaSemana: "2", horaInicio: "10:00", horaFin: "09:00" },
    });
    render(<FormularioHorario accion={accion} maquilladoraId={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar tramo" }));

    expect(await screen.findByText("La hora de fin debe ser posterior a la de inicio.")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Hasta")).toHaveValue("09:00");
    expect(screen.getByLabelText("Desde")).toHaveValue("10:00");
    expect(screen.getByLabelText("Día")).toHaveValue("2");
  });

  it("muestra el aviso de solapamiento como alerta", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ mensaje: "Ese tramo se solapa con otro." });
    render(<FormularioHorario accion={accion} maquilladoraId={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar tramo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese tramo se solapa con otro.");
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    let terminar!: (estado: EstadoAgenda) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<FormularioHorario accion={accion} maquilladoraId={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar tramo" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();

    terminar({});
    expect(await screen.findByRole("button", { name: "Agregar tramo" })).toBeEnabled();
  });
});
