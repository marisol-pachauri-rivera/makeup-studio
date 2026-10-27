import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { AccionesDeReserva } from "./acciones-de-reserva";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

const acciones = () => ({
  validar: vi.fn<Accion>().mockResolvedValue({ estado: "aplicada" }),
  rechazar: vi.fn<Accion>().mockResolvedValue({ estado: "aplicada" }),
  cancelar: vi.fn<Accion>().mockResolvedValue({ estado: "aplicada" }),
});

const campos = (datos: FormData) => Object.fromEntries(datos.entries());

describe("acciones según el estado", () => {
  it("en validación ofrece validar, rechazar y cancelar", () => {
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...acciones()} />);
    expect(screen.getByRole("button", { name: "Validar pago" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar pago" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it.each(["pendiente_pago", "confirmada"] as const)("en %s solo ofrece cancelar", (estado) => {
    render(<AccionesDeReserva reserva={{ id: 5, estado }} {...acciones()} />);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar pago" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar pago" })).toBeNull();
  });

  it("cancelada no ofrece ninguna acción", () => {
    render(<AccionesDeReserva reserva={{ id: 5, estado: "cancelada" }} {...acciones()} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText(/no hay acciones disponibles/)).toBeInTheDocument();
  });
});

describe("validar", () => {
  it("envía el id de la reserva", async () => {
    const a = acciones();
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...a} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Validar pago" }));

    expect(campos(a.validar.mock.calls[0][1])).toEqual({ id: "5" });
  });

  it("si la reserva cambió muestra el aviso con el estado actual", async () => {
    const a = acciones();
    a.validar.mockResolvedValue({ estado: "aviso", mensaje: "La reserva cambió mientras tanto: ahora está cancelada." });
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...a} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Validar pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ahora está cancelada");
  });
});

describe("rechazar", () => {
  it("envía el id y el motivo escrito", async () => {
    const a = acciones();
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...a} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Motivo del rechazo"), "no aparece en mi billetera");
    await u.click(screen.getByRole("button", { name: "Rechazar pago" }));

    expect(campos(a.rechazar.mock.calls[0][1])).toEqual({ id: "5", motivo: "no aparece en mi billetera" });
  });

  it("con el motivo inválido muestra el error junto al campo y conserva lo escrito", async () => {
    const a = acciones();
    a.rechazar.mockResolvedValue({
      estado: "invalido",
      errores: { motivo: "Escribí el motivo del rechazo." },
      valores: { motivo: "   " },
    });
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...a} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Motivo del rechazo"), "   ");
    await u.click(screen.getByRole("button", { name: "Rechazar pago" }));

    const campo = screen.getByLabelText("Motivo del rechazo");
    expect(await screen.findByText("Escribí el motivo del rechazo.")).toBeInTheDocument();
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveValue("   ");
  });

  it("limita el motivo a 300 caracteres", () => {
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...acciones()} />);
    expect(screen.getByLabelText("Motivo del rechazo")).toHaveAttribute("maxlength", "300");
  });
});

describe("cancelar", () => {
  it("no envía nada hasta confirmar y avisa que no se puede deshacer", async () => {
    const a = acciones();
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_pago" }} {...a} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(a.cancelar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/no se puede deshacer/);
    expect(screen.getByRole("button", { name: "Confirmar cancelación" })).toBeInTheDocument();
  });

  it("al confirmar envía el id y la marca de confirmación", async () => {
    const a = acciones();
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_pago" }} {...a} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await u.click(screen.getByRole("button", { name: "Confirmar cancelación" }));

    expect(campos(a.cancelar.mock.calls[0][1])).toEqual({ id: "5", confirmar: "true" });
  });

  it("volver deshace el aviso sin enviar", async () => {
    const a = acciones();
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_pago" }} {...a} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await u.click(screen.getByRole("button", { name: "Volver" }));

    expect(a.cancelar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it("en una confirmada el aviso menciona el reembolso pendiente", async () => {
    render(<AccionesDeReserva reserva={{ id: 5, estado: "confirmada" }} {...acciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/reembolso queda pendiente/);
  });

  it("en una no confirmada el aviso no menciona el reembolso", async () => {
    render(<AccionesDeReserva reserva={{ id: 5, estado: "pendiente_validacion" }} {...acciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(screen.getByRole("alert")).not.toHaveTextContent(/reembolso/);
  });
});
