import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/cancelacion/formulario";
import { BotonCancelar } from "./boton-cancelar";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<ResultadoFormulario>;

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";
// 15:00 UTC = 10:00 en Lima; el límite cae el 24 de diciembre.
const LIMITE = new Date("2026-12-24T15:00:00Z");
const ANTES = new Date("2026-12-21T15:00:00Z");
const DESPUES = new Date("2026-12-24T15:00:01Z");

const dibujar = (ahora: Date, accion: Accion = vi.fn<Accion>()) =>
  render(<BotonCancelar token={TOKEN} accion={accion} puedeCancelarHasta={LIMITE} ahora={ahora} />);

describe("BotonCancelar dentro del plazo", () => {
  it("muestra el botón activo y la fecha límite en hora de Lima", () => {
    dibujar(ANTES);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeEnabled();
    expect(screen.getByText(/Podés cancelar hasta el/)).toHaveTextContent(/jueves, 24 de diciembre a las 10:00 \(hora de Lima\)/);
  });

  it("con exactamente el límite todavía se puede", () => {
    dibujar(LIMITE);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeEnabled();
  });

  it("pide confirmar antes de enviar y no envía nada al primer clic", async () => {
    const accion = vi.fn<Accion>();
    dibujar(ANTES, accion);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, cancelar mi reserva" })).toBeInTheDocument();
  });

  it("al confirmar envía el token del enlace", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "cancelada" });
    dibujar(ANTES, accion);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await u.click(screen.getByRole("button", { name: "Sí, cancelar mi reserva" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({ token: TOKEN });
  });

  it("volver deshace el paso de confirmación sin enviar", async () => {
    const accion = vi.fn<Accion>();
    dibujar(ANTES, accion);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await u.click(screen.getByRole("button", { name: "Volver" }));

    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it("si el servidor rechaza (por ejemplo, fuera de plazo) muestra su mensaje", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "rechazada",
      motivo: "fuera_de_plazo",
      mensaje: "Ya no se puede cancelar desde acá: faltan menos de 24 horas para tu turno. Escribile al studio.",
    });
    dibujar(ANTES, accion);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await u.click(screen.getByRole("button", { name: "Sí, cancelar mi reserva" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Escribile al studio");
  });
});

describe("BotonCancelar con el plazo vencido", () => {
  it("deshabilita el botón y dice que escriba al studio", () => {
    dibujar(DESPUES);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/menos de 24 horas.*Escribile al studio/);
    expect(screen.queryByText(/Podés cancelar hasta/)).toBeNull();
  });
});
