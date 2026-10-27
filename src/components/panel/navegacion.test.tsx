import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccesosDelPanel, NavegacionPanel } from "./navegacion";

describe("NavegacionPanel", () => {
  it("enlaza a las secciones de reservas, agenda, reembolsos, servicios y maquilladoras", () => {
    render(<NavegacionPanel />);
    const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(nav).getByRole("link", { name: "Reservas" })).toHaveAttribute("href", "/admin/reservas");
    expect(within(nav).getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/admin/agenda");
    expect(within(nav).getByRole("link", { name: "Reembolsos" })).toHaveAttribute("href", "/admin/reembolsos");
    expect(within(nav).getByRole("link", { name: "Servicios" })).toHaveAttribute("href", "/admin/servicios");
    expect(within(nav).getByRole("link", { name: "Maquilladoras" })).toHaveAttribute("href", "/admin/maquilladoras");
  });
});

describe("AccesosDelPanel", () => {
  it("ofrece un acceso por sección, con su descripción", () => {
    render(<AccesosDelPanel />);
    expect(screen.getByRole("link", { name: /Reservas/ })).toHaveAttribute("href", "/admin/reservas");
    expect(screen.getByRole("link", { name: /Agenda/ })).toHaveAttribute("href", "/admin/agenda");
    expect(screen.getByRole("link", { name: /Reembolsos/ })).toHaveAttribute("href", "/admin/reembolsos");
    expect(screen.getByRole("link", { name: /Servicios/ })).toHaveAttribute("href", "/admin/servicios");
    expect(screen.getByRole("link", { name: /Maquilladoras/ })).toHaveAttribute("href", "/admin/maquilladoras");
    expect(screen.getByText(/Catálogo/)).toBeInTheDocument();
  });
});
