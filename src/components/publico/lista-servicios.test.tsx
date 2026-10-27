import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ServicioPublico } from "@/lib/publico/catalogo";
import { imagenDePrueba, ListaServicios } from "./lista-servicios";

const servicio = (extra: Partial<ServicioPublico> = {}): ServicioPublico => ({
  id: 1,
  nombre: "Maquillaje social",
  descripcion: "Para eventos",
  precio: "120.00",
  duracionMinutos: 60,
  activo: true,
  ...extra,
});

describe("ListaServicios", () => {
  it("muestra nombre, descripción, precio y duración", () => {
    render(<ListaServicios servicios={[servicio()]} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("heading", { name: "Maquillaje social" })).toBeInTheDocument();
    expect(within(item).getByText("Para eventos")).toBeInTheDocument();
    expect(within(item).getByText("120.00")).toBeInTheDocument();
    expect(within(item).getByText("60 min")).toBeInTheDocument();
  });

  it("muestra el precio exacto, sin redondeos", () => {
    render(<ListaServicios servicios={[servicio({ precio: "350.50" })]} />);
    expect(screen.getByText("350.50")).toBeInTheDocument();
  });

  it("no deja huecos ni 'undefined' si el servicio no tiene descripción", () => {
    const { container } = render(<ListaServicios servicios={[servicio({ descripcion: "" })]} />);
    expect(container).not.toHaveTextContent("undefined");
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Maquillaje social" })).toBeInTheDocument();
  });

  it("cada servicio enlaza a sus horarios", () => {
    render(<ListaServicios servicios={[servicio({ id: 7, nombre: "Peinado" })]} />);
    expect(screen.getByRole("link", { name: "Ver horarios de Peinado" })).toHaveAttribute(
      "href",
      "/servicios/7/disponibilidad",
    );
  });

  it("lista todos los servicios recibidos en su orden", () => {
    render(<ListaServicios servicios={[servicio({ id: 1, nombre: "A" }), servicio({ id: 2, nombre: "B" })]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["A", "B"]);
  });

  it("sin servicios lo indica y no ofrece ninguna reserva", () => {
    render(<ListaServicios servicios={[]} />);
    expect(screen.getByText(/no hay servicios disponibles/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("imágenes de prueba", () => {
  it("cada servicio muestra una imagen decorativa, sin texto alternativo", () => {
    const { container } = render(<ListaServicios servicios={[servicio({ id: 1 }), servicio({ id: 2, nombre: "Peinado" })]} />);
    const imagenes = container.querySelectorAll("img");
    expect(imagenes).toHaveLength(2);
    imagenes.forEach((img) => expect(img).toHaveAttribute("alt", ""));
  });

  it("el reparto es estable y recorre las tres imágenes", () => {
    expect(imagenDePrueba(5)).toBe(imagenDePrueba(5));
    expect(new Set([1, 2, 3].map(imagenDePrueba)).size).toBe(3);
  });
});
