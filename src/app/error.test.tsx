import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";
import ErrorPage from "./error";

const SECRETO = "relation reservas does not exist postgres://user:secreta@host/db";

describe.each([
  ["error de ruta", ErrorPage],
  ["error global", GlobalError],
])("%s", (_nombre, Componente) => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("muestra un mensaje amigable sin el texto del error", () => {
    const { container } = render(<Componente error={new Error(SECRETO)} retry={() => {}} />);

    expect(screen.getByRole("heading", { name: /algo salió mal/i })).toBeInTheDocument();
    expect(container.ownerDocument.body.textContent).not.toContain("secreta");
    expect(container.ownerDocument.body.textContent).not.toContain("postgres");
  });

  it("invoca retry desde el botón", async () => {
    const retry = vi.fn();
    render(<Componente error={new Error(SECRETO)} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
