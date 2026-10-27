import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BotonEstado } from "./boton-estado";
import { EstadoBadge } from "./estado-badge";

describe("BotonEstado", () => {
  it("sobre un registro activo pide desactivarlo (estado destino false)", async () => {
    const accion = vi.fn<(datos: FormData) => Promise<void>>().mockResolvedValue();
    render(<BotonEstado accion={accion} id={5} activo registro="Peinado" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Desactivar Peinado" }));

    expect(Object.fromEntries(accion.mock.calls[0][0].entries())).toEqual({ id: "5", activo: "false" });
  });

  it("sobre un registro inactivo pide activarlo (estado destino true)", async () => {
    const accion = vi.fn<(datos: FormData) => Promise<void>>().mockResolvedValue();
    render(<BotonEstado accion={accion} id={5} activo={false} registro="Peinado" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Activar Peinado" }));

    expect(Object.fromEntries(accion.mock.calls[0][0].entries())).toEqual({ id: "5", activo: "true" });
  });

  it("no ofrece ninguna acción de borrado", () => {
    render(<BotonEstado accion={vi.fn()} id={5} activo registro="Peinado" />);
    expect(screen.queryByRole("button", { name: /borrar|eliminar/i })).toBeNull();
  });
});

describe("EstadoBadge", () => {
  it("dice Activo o Inactivo con texto, no solo con color", () => {
    const { rerender } = render(<EstadoBadge activo />);
    expect(screen.getByText("Activo")).toBeInTheDocument();
    rerender(<EstadoBadge activo={false} />);
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("admite textos en femenino", () => {
    render(<EstadoBadge activo={false} textos={["Activa", "Inactiva"]} />);
    expect(screen.getByText("Inactiva")).toBeInTheDocument();
  });
});
