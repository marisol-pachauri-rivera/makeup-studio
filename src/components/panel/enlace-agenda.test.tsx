import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnlaceAgenda } from "./enlace-agenda";

describe("EnlaceAgenda", () => {
  it("lleva a la agenda de esa maquilladora y se nombra con ella", () => {
    render(<EnlaceAgenda id={12} nombre="Lucía" />);
    const enlace = screen.getByRole("link", { name: "Agenda de Lucía" });
    expect(enlace).toHaveAttribute("href", "/admin/maquilladoras/12/agenda");
    expect(enlace).toHaveTextContent("Agenda");
  });
});
