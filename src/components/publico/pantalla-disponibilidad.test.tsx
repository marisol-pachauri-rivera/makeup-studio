import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiaConHuecos } from "@/lib/disponibilidad/huecos";
import type { MaquilladoraPublica, ServicioPublico } from "@/lib/publico/catalogo";
import { fechaCorta, fechaLarga } from "./formato-fecha";
import { PantallaDisponibilidad } from "./pantalla-disponibilidad";

// Los horarios son botones que navegan con el router de Next.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const servicio: ServicioPublico = {
  id: 4,
  nombre: "Maquillaje social",
  descripcion: "",
  precio: "350.50",
  duracionMinutos: 60,
  activo: true,
};
const ana: MaquilladoraPublica = { id: 1, nombre: "Ana", activa: true };
const bea: MaquilladoraPublica = { id: 2, nombre: "Bea", activa: true };

// 14:00Z y 14:30Z son las 09:00 y 09:30 en Lima.
const dia = (fecha: string, ...horasUtc: string[]): DiaConHuecos => ({
  fecha,
  inicios: horasUtc.map((h) => new Date(`${fecha}T${h}:00Z`)),
});
const dias = [dia("2026-12-24", "14:00", "14:30"), dia("2026-12-28", "15:00")];

describe("fechas", () => {
  it("formatea la fecha de calendario sin desplazar el día", () => {
    expect(fechaLarga("2026-12-24")).toMatch(/jueves.*24.*diciembre/i);
    expect(fechaCorta("2026-12-24")).toMatch(/24/);
    expect(fechaCorta("2026-12-24")).toMatch(/dic/i);
  });
});

describe("PantallaDisponibilidad", () => {
  it("muestra el servicio con su precio exacto y su duración", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} dias={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Maquillaje social" })).toBeInTheDocument();
    expect(screen.getByText("350.50 · 60 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al catálogo" })).toHaveAttribute("href", "/");
  });

  it("sin maquilladora elegida pide elegir y no muestra horarios ni preselecciona", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana, bea]} dias={[]} />);
    expect(screen.getByText("Elegí una maquilladora para ver sus horarios.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Horarios libres" })).toBeNull();
    for (const enlace of [screen.getByRole("link", { name: "Ana" }), screen.getByRole("link", { name: "Bea" })]) {
      expect(enlace).not.toHaveAttribute("aria-current");
    }
  });

  it("ofrece cada maquilladora con un enlace que conserva el servicio", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana, bea]} dias={[]} />);
    expect(screen.getByRole("link", { name: "Ana" })).toHaveAttribute("href", "/servicios/4/disponibilidad?maquilladora=1");
    expect(screen.getByRole("link", { name: "Bea" })).toHaveAttribute("href", "/servicios/4/disponibilidad?maquilladora=2");
  });

  it("marca la maquilladora elegida con aria-current", () => {
    render(
      <PantallaDisponibilidad servicio={servicio} maquilladoras={[ana, bea]} elegida={bea} dias={dias} diaElegido={dias[0]} />,
    );
    expect(screen.getByRole("link", { name: "Bea" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Ana" })).not.toHaveAttribute("aria-current");
  });

  it("sin maquilladoras activas lo indica", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[]} dias={[]} />);
    expect(screen.getByText("Por ahora no hay maquilladoras disponibles.")).toBeInTheDocument();
    expect(screen.queryByText("Elegí una maquilladora para ver sus horarios.")).toBeNull();
  });

  it("con maquilladora elegida lista los días y los horarios del día elegido en hora de Lima", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} elegida={ana} dias={dias} diaElegido={dias[0]} />);

    const selectorDias = screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.includes("fecha="));
    expect(selectorDias.map((l) => l.getAttribute("href"))).toEqual([
      "/servicios/4/disponibilidad?maquilladora=1&fecha=2026-12-24",
      "/servicios/4/disponibilidad?maquilladora=1&fecha=2026-12-28",
    ]);
    expect(selectorDias[0]).toHaveAttribute("aria-current", "date");
    expect(selectorDias[1]).not.toHaveAttribute("aria-current");

    const horarios = within(screen.getByRole("list", { name: "Horarios libres" })).getAllByRole("listitem");
    expect(horarios.map((h) => h.textContent)).toEqual(["09:00", "09:30"]);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/jueves.*24.*diciembre/i);
  });

  it("muestra los horarios del otro día cuando ese es el elegido", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} elegida={ana} dias={dias} diaElegido={dias[1]} />);
    expect(
      within(screen.getByRole("list", { name: "Horarios libres" }))
        .getAllByRole("listitem")
        .map((h) => h.textContent),
    ).toEqual(["10:00"]);
  });

  it("si la maquilladora no tiene horarios lo indica y sugiere otra", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana, bea]} elegida={ana} dias={[]} />);
    expect(screen.getByText(/Ana no tiene horarios disponibles por ahora\. Probá con otra maquilladora\./)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Horarios libres" })).toBeNull();
  });

  it("los horarios son botones que se pueden elegir, no enlaces", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} elegida={ana} dias={dias} diaElegido={dias[0]} />);
    const lista = screen.getByRole("list", { name: "Horarios libres" });
    expect(within(lista).queryByRole("link")).toBeNull();
    expect(within(lista).getAllByRole("button").map((b) => b.textContent)).toEqual(["09:00", "09:30"]);
    expect(screen.getByRole("button", { name: "Elegir el horario de las 09:30" })).toBeInTheDocument();
  });

  it("avisa que elegir no reserva hasta confirmar", () => {
    render(<PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} elegida={ana} dias={dias} diaElegido={dias[0]} />);
    expect(screen.getByText(/todavía no queda reservado hasta que confirmes/i)).toBeInTheDocument();
    expect(screen.queryByText(/solo informativos/i)).toBeNull();
  });

  it("no muestra datos de clientas", () => {
    const { container } = render(
      <PantallaDisponibilidad servicio={servicio} maquilladoras={[ana]} elegida={ana} dias={dias} diaElegido={dias[0]} />,
    );
    expect(container).not.toHaveTextContent(/teléfono|reserva de|pendiente/i);
  });
});
