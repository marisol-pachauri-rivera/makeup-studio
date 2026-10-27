import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoAgenda } from "@/lib/agenda/formularios";
import { FormularioBloqueo } from "./formulario-bloqueo";

type Accion = (estado: EstadoAgenda, datos: FormData) => Promise<EstadoAgenda>;

describe("FormularioBloqueo", () => {
  it("usa campos de fecha y hora, manda la maquilladora y avisa que la hora es de Lima", () => {
    const { container } = render(<FormularioBloqueo accion={vi.fn<Accion>()} maquilladoraId={3} />);
    expect(container.querySelector('input[name="maquilladoraId"]')).toHaveValue("3");
    expect(screen.getByLabelText("Desde")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Motivo")).toHaveAccessibleDescription(/hora de Lima/i);
  });

  it("envía lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ exito: "Bloqueo agregado." });
    render(<FormularioBloqueo accion={accion} maquilladoraId={3} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Desde"), "2026-12-24T09:00");
    await u.type(screen.getByLabelText("Hasta"), "2026-12-26T18:00");
    await u.type(screen.getByLabelText("Motivo"), "Vacaciones");
    await u.click(screen.getByRole("button", { name: "Agregar bloqueo" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({
      maquilladoraId: "3",
      inicio: "2026-12-24T09:00",
      fin: "2026-12-26T18:00",
      motivo: "Vacaciones",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Bloqueo agregado.");
  });

  it("con errores los muestra por campo y conserva lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      errores: { motivo: "El motivo es obligatorio.", fin: "El fin debe ser posterior al inicio." },
      valores: { inicio: "2026-12-26T09:00", fin: "2026-12-24T09:00", motivo: "  " },
    });
    render(<FormularioBloqueo accion={accion} maquilladoraId={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar bloqueo" }));

    expect(await screen.findByText("El motivo es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("El fin debe ser posterior al inicio.")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-12-26T09:00");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-12-24T09:00");
    expect(screen.getByLabelText("Motivo")).toHaveValue("  ");
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    let terminar!: (estado: EstadoAgenda) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<FormularioBloqueo accion={accion} maquilladoraId={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar bloqueo" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();

    terminar({});
    expect(await screen.findByRole("button", { name: "Agregar bloqueo" })).toBeEnabled();
  });
});
