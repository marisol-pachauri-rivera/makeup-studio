import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/pago/formulario";
import { FormularioNumero } from "./formulario-numero";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<ResultadoFormulario>;

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";
const enviar = () => screen.getByRole("button", { name: "Ya pagué: enviar mi número" });

describe("FormularioNumero", () => {
  it("ofrece un campo de texto para el número, sin subir archivos", () => {
    const { container } = render(<FormularioNumero token={TOKEN} accion={vi.fn<Accion>()} />);
    expect(screen.getByLabelText("Número de operación")).toHaveValue("");
    expect(screen.getByLabelText("Número de operación")).toHaveAttribute("autocomplete", "off");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(enviar()).toBeEnabled();
  });

  it("manda el token en un campo oculto y el número escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "registrado" });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Número de operación"), "op-123456");
    await u.click(enviar());

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({ token: TOKEN, numero: "op-123456" });
  });

  it("al informarse el pago confirma que se recibió y no deja reenviar", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "registrado" });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByRole("status")).toHaveTextContent("Recibimos tu número de operación");
    expect(enviar()).toBeDisabled();
  });

  it("un error del campo se muestra junto al campo, lo marca inválido y conserva lo escrito", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { numero: "El número de operación debe tener entre 4 y 30 caracteres." },
      valores: { numero: "12 34" },
    });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByText(/entre 4 y 30 caracteres/)).toBeInTheDocument();
    const campo = screen.getByLabelText("Número de operación");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveValue("12 34");
    expect(campo).toHaveAccessibleDescription(/entre 4 y 30 caracteres/);
    expect(enviar()).toBeEnabled();
  });

  it("un número ya usado se muestra junto al campo y se puede corregir", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "invalido",
      errores: { numero: "Ese número de operación ya fue usado en otra reserva. Revisá que esté bien escrito." },
      valores: { numero: "OP-1111" },
    });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByText(/ya fue usado en otra reserva/)).toBeInTheDocument();
    expect(screen.getByLabelText("Número de operación")).toHaveValue("OP-1111");
    expect(enviar()).toBeEnabled();
  });

  it("deshabilita el botón mientras la acción está en curso", async () => {
    let terminar!: (r: ResultadoFormulario) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByRole("button", { name: "Enviando…" })).toBeDisabled();
    terminar({ estado: "invalido", errores: { numero: "Ingresá el número de operación." }, valores: { numero: "" } });
    expect(await screen.findByRole("button", { name: "Ya pagué: enviar mi número" })).toBeEnabled();
  });

  it("reserva vencida: explica que venció, ofrece elegir otro horario y quita el campo", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "rechazado",
      motivo: "vencida",
      mensaje: "Tu reserva venció: pasaron 20 minutos sin pago y otra clienta tomó el horario. Elegí otro horario.",
    });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByRole("alert")).toHaveTextContent(/Tu reserva venció/);
    expect(screen.getByRole("link", { name: "Elegir otro horario" })).toHaveAttribute("href", "/");
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ya pagué: enviar mi número" })).toBeNull();
  });

  it.each([
    ["cancelada", "Esta reserva fue cancelada, así que ya no se puede informar un pago."],
    ["pago_ya_informado", "Ya informaste el pago de esta reserva con otro número. El studio lo está revisando."],
    ["ya_confirmada", "Esta reserva ya está confirmada."],
    ["no_encontrada", "No encontramos tu reserva."],
  ] as const)("el rechazo %s se explica con un aviso, sin enlace de otro horario", async (motivo, mensaje) => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "rechazado", motivo, mensaje });
    render(<FormularioNumero token={TOKEN} accion={accion} />);
    await userEvent.setup().click(enviar());

    expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
  });
});
