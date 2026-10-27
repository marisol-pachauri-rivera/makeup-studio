import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextoReembolso } from "./texto-reembolso";

describe("TextoReembolso", () => {
  it("pendiente: monto, que lo gestiona el studio y que está pendiente, sin plazos", () => {
    const { container } = render(<TextoReembolso estadoReembolso="pendiente" montoTotal="350.50" />);
    expect(screen.getByText("350.50")).toBeInTheDocument();
    expect(container).toHaveTextContent(/El studio gestiona la devolución/);
    expect(container).toHaveTextContent(/pendiente/);
    expect(container).not.toHaveTextContent(/horas|días|dias|semana/);
  });

  it("realizado: dice que el studio ya la realizó", () => {
    const { container } = render(<TextoReembolso estadoReembolso="realizado" montoTotal="350.50" />);
    expect(container).toHaveTextContent(/ya realizó la devolución de 350\.50/);
    expect(container).not.toHaveTextContent(/pendiente/);
  });

  it("no aplica: dice que no hay pago que devolver", () => {
    const { container } = render(<TextoReembolso estadoReembolso="no_aplica" montoTotal="350.50" />);
    expect(container).toHaveTextContent("No hay pago que devolver");
    expect(screen.queryByText("350.50")).toBeNull();
  });
});
