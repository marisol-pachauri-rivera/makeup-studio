import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoLogin } from "./iniciar-sesion";

const iniciarSesion = vi.fn<(estado: EstadoLogin, datos: FormData) => Promise<EstadoLogin>>();
vi.mock("./actions", () => ({ iniciarSesion }));

const { FormularioLogin } = await import("./formulario-login");

beforeEach(() => {
  iniciarSesion.mockReset();
});

async function enviar(usuario = "", password = "") {
  const u = userEvent.setup();
  if (usuario) await u.type(screen.getByLabelText("Usuario"), usuario);
  if (password) await u.type(screen.getByLabelText("Contraseña"), password);
  await u.click(screen.getByRole("button", { name: "Ingresar" }));
}

describe("FormularioLogin", () => {
  it("muestra los campos, con la contraseña oculta y el destino en un campo oculto", () => {
    const { container } = render(<FormularioLogin callbackUrl="/admin/reservas" />);
    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(container.querySelector('input[name="callbackUrl"]')).toHaveValue("/admin/reservas");
  });

  it("con campos vacíos muestra qué falta, marcado como inválido", async () => {
    iniciarSesion.mockResolvedValue({
      usuario: "",
      errores: { usuario: "Ingresá tu usuario.", password: "Ingresá tu contraseña." },
    });
    render(<FormularioLogin callbackUrl="/admin" />);
    await enviar();

    expect(await screen.findByText("Ingresá tu usuario.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu contraseña.")).toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
  });

  it("ante credenciales inválidas muestra el aviso y conserva el usuario", async () => {
    iniciarSesion.mockResolvedValue({ usuario: "maria", mensaje: "Usuario o contraseña incorrectos." });
    render(<FormularioLogin callbackUrl="/admin" />);
    await enviar("maria", "mala");

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos.");
    expect(screen.getByLabelText("Usuario")).toHaveValue("maria");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });

  it("ante el bloqueo muestra el aviso de espera", async () => {
    iniciarSesion.mockResolvedValue({
      usuario: "maria",
      mensaje: "Demasiados intentos fallidos. Probá de nuevo en 12 minutos.",
    });
    render(<FormularioLogin callbackUrl="/admin" />);
    await enviar("maria", "mala");

    expect(await screen.findByRole("alert")).toHaveTextContent("Probá de nuevo en 12 minutos.");
  });

  it("envía usuario, contraseña y destino a la acción", async () => {
    iniciarSesion.mockResolvedValue({});
    render(<FormularioLogin callbackUrl="/admin/reservas" />);
    await enviar("maria", "clave");

    const datos = iniciarSesion.mock.calls[0][1];
    expect(datos.get("usuario")).toBe("maria");
    expect(datos.get("password")).toBe("clave");
    expect(datos.get("callbackUrl")).toBe("/admin/reservas");
  });
});
