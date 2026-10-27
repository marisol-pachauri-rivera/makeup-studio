import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoFormulario } from "@/lib/catalogo/formularios";
import { FormularioServicio } from "./formulario-servicio";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

const servicio = { id: 7, nombre: "Peinado", descripcion: "Con ondas", precio: "80.00", duracionMinutos: 45 };

describe("FormularioServicio", () => {
  it("en alta muestra los campos vacíos y ofrece crear", () => {
    const { container } = render(<FormularioServicio accion={vi.fn<Accion>()} />);
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("");
    expect(screen.getByLabelText("Precio")).toHaveValue("");
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Crear servicio" })).toBeEnabled();
    expect(container.querySelector('input[name="id"]')).toBeNull();
  });

  it("en edición carga los valores guardados y manda el id en un campo oculto", () => {
    const { container } = render(<FormularioServicio accion={vi.fn<Accion>()} servicio={servicio} />);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Peinado");
    expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Con ondas");
    expect(screen.getByLabelText("Precio")).toHaveValue("80.00");
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue("45");
    expect(container.querySelector('input[name="id"]')).toHaveValue("7");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });

  it("envía lo escrito en los campos que espera la acción", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({});
    render(<FormularioServicio accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Nombre"), "Maquillaje social");
    await u.type(screen.getByLabelText("Precio"), "350,50");
    await u.type(screen.getByLabelText("Duración (minutos)"), "60");
    await u.click(screen.getByRole("button", { name: "Crear servicio" }));

    const datos = accion.mock.calls[0][1];
    expect(Object.fromEntries(datos.entries())).toEqual({
      nombre: "Maquillaje social",
      descripcion: "",
      precio: "350,50",
      duracionMinutos: "60",
    });
  });

  it("muestra el error de cada campo, lo marca inválido y conserva lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      errores: { nombre: "El nombre es obligatorio.", precio: "El precio no es válido." },
      valores: { nombre: "", descripcion: "", precio: "abc", duracionMinutos: "60" },
    });
    render(<FormularioServicio accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Precio"), "abc");
    await u.type(screen.getByLabelText("Duración (minutos)"), "60");
    await u.click(screen.getByRole("button", { name: "Crear servicio" }));

    expect(await screen.findByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("El precio no es válido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Precio")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Duración (minutos)")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Precio")).toHaveValue("abc");
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue("60");
    expect(screen.getByLabelText("Precio")).toHaveAccessibleDescription(/El precio no es válido\./);
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    let terminar!: (estado: EstadoFormulario) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<FormularioServicio accion={accion} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Crear servicio" }));

    const guardando = await screen.findByRole("button", { name: "Guardando…" });
    expect(guardando).toBeDisabled();

    terminar({});
    expect(await screen.findByRole("button", { name: "Crear servicio" })).toBeEnabled();
  });

  it("ofrece cancelar volviendo al listado", () => {
    render(<FormularioServicio accion={vi.fn<Accion>()} />);
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/admin/servicios");
  });
});
