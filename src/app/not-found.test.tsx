import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

it("ofrece un enlace al inicio", () => {
  render(<NotFound />);

  expect(screen.getByRole("heading", { name: /no encontramos/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/");
});
