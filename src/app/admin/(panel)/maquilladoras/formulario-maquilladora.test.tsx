import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoFormulario } from "@/lib/catalogo/formularios";
import { FormularioMaquilladora } from "./formulario-maquilladora";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

describe("FormularioMaquilladora", () => {
  it("en alta muestra el nombre vacío y ofrece crear", () => {
    const { container } = render(<FormularioMaquilladora accion={vi.fn<Accion>()} />);
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Crear maquilladora" })).toBeEnabled();
    expect(container.querySelector('input[name="id"]')).toBeNull();
  });

  it("en edición carga el nombre guardado y manda el id en un campo oculto", () => {
    const { container } = render(<FormularioMaquilladora accion={vi.fn<Accion>()} maquilladora={{ id: 3, nombre: "Lucía" }} />);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Lucía");
    expect(container.querySelector('input[name="id"]')).toHaveValue("3");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });

  it("envía el nombre escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({});
    render(<FormularioMaquilladora accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Nombre"), "Ana");
    await u.click(screen.getByRole("button", { name: "Crear maquilladora" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({ nombre: "Ana" });
  });

  it("con un nombre inválido muestra el error, lo marca inválido y conserva lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      errores: { nombre: "El nombre es obligatorio." },
      valores: { nombre: "   " },
    });
    render(<FormularioMaquilladora accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Nombre"), "   ");
    await u.click(screen.getByRole("button", { name: "Crear maquilladora" }));

    expect(await screen.findByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre")).toHaveValue("   ");
    expect(screen.getByLabelText("Nombre")).toHaveAccessibleDescription("El nombre es obligatorio.");
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    let terminar!: (estado: EstadoFormulario) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<FormularioMaquilladora accion={accion} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Crear maquilladora" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();

    terminar({});
    expect(await screen.findByRole("button", { name: "Crear maquilladora" })).toBeEnabled();
  });

  it("ofrece cancelar volviendo al listado", () => {
    render(<FormularioMaquilladora accion={vi.fn<Accion>()} />);
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/admin/maquilladoras");
  });
});
