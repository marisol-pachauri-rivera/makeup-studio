import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeccionDeMaquilladora } from "@/lib/agenda-panel/armar-dia";
import { AgendaMaquilladora } from "./agenda-maquilladora";
import { NavegacionDias } from "./navegacion-dias";

describe("NavegacionDias", () => {
  it("ofrece anterior, siguiente y hoy con la fecha en la URL", () => {
    render(<NavegacionDias fecha="2026-03-10" hoy="2026-03-05" />);
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/admin/agenda?fecha=2026-03-09");
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/admin/agenda?fecha=2026-03-11");
    expect(screen.getByRole("link", { name: "Hoy" })).toHaveAttribute("href", "/admin/agenda?fecha=2026-03-05");
  });

  it("la franja tiene los siete días de lunes a domingo y marca el mostrado también con texto", () => {
    // 2026-03-10 es martes: la semana va del 9 al 15.
    render(<NavegacionDias fecha="2026-03-10" hoy="2026-03-05" />);
    const franja = within(screen.getByRole("list", { name: "Días de la semana" }));
    const enlaces = franja.getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual(
      ["09", "10", "11", "12", "13", "14", "15"].map((d) => `/admin/agenda?fecha=2026-03-${d}`),
    );
    const mostrado = enlaces.filter((a) => a.getAttribute("aria-current") === "date");
    expect(mostrado).toHaveLength(1);
    expect(mostrado[0]).toHaveAttribute("href", "/admin/agenda?fecha=2026-03-10");
    expect(mostrado[0]).toHaveTextContent("(día mostrado)");
  });

  it("el selector de fecha es un formulario GET que funciona sin JavaScript", () => {
    const { container } = render(<NavegacionDias fecha="2026-03-10" hoy="2026-03-05" />);
    const formulario = container.querySelector("form") as HTMLFormElement;
    expect(formulario).toHaveAttribute("method", "get");
    expect(formulario).toHaveAttribute("action", "/admin/agenda");
    const campo = screen.getByLabelText("Ir a una fecha");
    expect(campo).toHaveAttribute("type", "date");
    expect(campo).toHaveAttribute("name", "fecha");
    expect(campo).toHaveValue("2026-03-10");
    expect(screen.getByRole("button", { name: "Ir" })).toHaveAttribute("type", "submit");
  });
});

const seccion = (extra: Partial<SeccionDeMaquilladora> = {}): SeccionDeMaquilladora => ({
  id: 4,
  nombre: "Ana",
  activa: true,
  horario: ["09:00 a 13:00", "15:00 a 19:00"],
  filas: [],
  ...extra,
});

describe("AgendaMaquilladora", () => {
  it("muestra el horario del día y el enlace a Horario y bloqueos de esa maquilladora", () => {
    render(<AgendaMaquilladora seccion={seccion()} />);
    expect(screen.getByRole("heading", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByText("Trabaja 09:00 a 13:00 y 15:00 a 19:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Horario y bloqueos de Ana" })).toHaveAttribute(
      "href",
      "/admin/maquilladoras/4/agenda",
    );
  });

  it("sin horario ese día dice que no trabaja", () => {
    render(<AgendaMaquilladora seccion={seccion({ horario: [] })} />);
    expect(screen.getByText("No trabaja este día")).toBeInTheDocument();
  });

  it("sin turnos ni bloqueos muestra el estado vacío en vez de una tabla", () => {
    render(<AgendaMaquilladora seccion={seccion()} />);
    expect(screen.getByText("Sin turnos ni bloqueos.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("un turno muestra hora, persona, servicio, contacto y el estado escrito", () => {
    render(
      <AgendaMaquilladora
        seccion={seccion({
          filas: [
            {
              tipo: "turno",
              clave: "turno-1",
              inicio: new Date("2026-12-21T15:00:00Z"),
              hora: "10:00 a 11:00",
              persona: "Marta",
              servicio: "Peinado",
              estado: "Confirmada",
              marcas: [],
              contacto: "Lucía",
              telefono: "999111222",
            },
          ],
        })}
      />,
    );
    const fila = within(screen.getAllByRole("row")[1]);
    expect(fila.getByText("10:00 a 11:00")).toBeInTheDocument();
    expect(fila.getByText("Marta · Peinado")).toBeInTheDocument();
    expect(fila.getByText(/Contacto: Lucía · 999111222/)).toBeInTheDocument();
    expect(fila.getByText("Confirmada")).toBeInTheDocument();
  });

  it("una reserva vencida lleva la marca Plazo vencido escrita junto a su estado", () => {
    render(
      <AgendaMaquilladora
        seccion={seccion({
          filas: [
            {
              tipo: "turno",
              clave: "turno-2",
              inicio: new Date("2026-12-21T15:00:00Z"),
              hora: "10:00 a 11:00",
              persona: "Rosa",
              servicio: "Social",
              estado: "Pendiente de pago",
              marcas: ["Plazo vencido"],
              contacto: null,
              telefono: "999000111",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Pendiente de pago")).toBeInTheDocument();
    expect(screen.getByText("Plazo vencido")).toBeInTheDocument();
    expect(screen.getByText("Contacto: 999000111")).toBeInTheDocument();
  });

  it("un bloqueo se etiqueta con la palabra Bloqueo y muestra su motivo", () => {
    render(
      <AgendaMaquilladora
        seccion={seccion({
          filas: [{ tipo: "bloqueo", clave: "bloqueo-1", inicio: new Date("2026-12-21T18:00:00Z"), hora: "13:00 a 14:00", motivo: "Almuerzo" }],
        })}
      />,
    );
    const fila = within(screen.getAllByRole("row")[1]);
    expect(fila.getByText("Bloqueo")).toBeInTheDocument();
    expect(fila.getByText("Almuerzo")).toBeInTheDocument();
  });

  it("una maquilladora inactiva con turnos se indica con texto", () => {
    render(<AgendaMaquilladora seccion={seccion({ activa: false })} />);
    expect(screen.getByRole("heading", { name: /Ana.*\(inactiva\)/ })).toBeInTheDocument();
  });

  it("no ofrece ningún botón ni formulario de escritura", () => {
    const { container } = render(<AgendaMaquilladora seccion={seccion()} />);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
