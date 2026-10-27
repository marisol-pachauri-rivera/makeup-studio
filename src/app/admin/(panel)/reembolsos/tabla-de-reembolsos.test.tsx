import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReembolsoPendiente } from "@/lib/cancelacion/reembolsos";
import type { EstadoFormulario } from "@/lib/reservas-panel/formularios";
import { TablaDeReembolsos } from "./tabla-de-reembolsos";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

const fila = (extra: Partial<ReembolsoPendiente> = {}): ReembolsoPendiente => ({
  id: 4,
  montoTotal: "350.50",
  numeroOperacion: "OP-1111",
  nombreContacto: "Ana",
  telefonoContacto: "999 000 111",
  creadaEn: new Date("2026-12-21T15:00:00Z"),
  ...extra,
});

describe("TablaDeReembolsos", () => {
  it("sin pendientes dice que no hay reembolsos por hacer", () => {
    render(<TablaDeReembolsos filas={[]} accion={vi.fn<Accion>()} />);
    expect(screen.getByText("No hay reembolsos por hacer.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("muestra monto, número de operación, nombre y teléfono como enlace", () => {
    render(<TablaDeReembolsos filas={[fila()]} accion={vi.fn<Accion>()} />);
    const fila1 = within(screen.getAllByRole("row")[1]);
    expect(fila1.getByText("Ana")).toBeInTheDocument();
    expect(fila1.getByText("OP-1111")).toBeInTheDocument();
    expect(fila1.getByText("350.50")).toBeInTheDocument();
    expect(fila1.getByRole("link", { name: "999 000 111" })).toHaveAttribute("href", "tel:999000111");
    expect(fila1.getByRole("link", { name: "Ver reserva" })).toHaveAttribute("href", "/admin/reservas/4");
  });

  it("una reserva sin número de operación lo dice", () => {
    render(<TablaDeReembolsos filas={[fila({ numeroOperacion: null })]} accion={vi.fn<Accion>()} />);
    expect(screen.getByText("Sin número registrado")).toBeInTheDocument();
  });

  it("lista una fila por reembolso", () => {
    render(<TablaDeReembolsos filas={[fila(), fila({ id: 5, nombreContacto: "Bea" })]} accion={vi.fn<Accion>()} />);
    expect(screen.getAllByRole("button", { name: /Marcar como realizado/ })).toHaveLength(2);
  });

  it("marcar envía el id de la reserva", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "aplicada" });
    render(<TablaDeReembolsos filas={[fila()]} accion={accion} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Marcar como realizado el reembolso de Ana" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({ id: "4" });
  });

  it("si no se pudo marcar muestra el aviso", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "aviso", mensaje: "Este reembolso ya estaba marcado como realizado." });
    render(<TablaDeReembolsos filas={[fila()]} accion={accion} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Marcar como realizado/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya estaba marcado");
  });
});
