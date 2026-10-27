import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Integrante } from "@/lib/reserva/asistente";
import { ListaIntegrantes } from "./lista-integrantes";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const completa = (n: number, nombre: string, extra: Partial<Integrante> = {}): Integrante => ({
  id: uuid(n),
  nombre,
  servicio: { id: 4, nombre: "Maquillaje social", precio: "350.50", duracionMinutos: 60 },
  maquilladora: { id: 2, nombre: "Lucía" },
  inicio: "2026-12-24T14:00:00.000Z", // jueves 24, 09:00 en Lima
  ...extra,
});
const vacia = (n: number): Integrante => ({ id: uuid(n), nombre: "" });

function dibujar(integrantes: Integrante[], props: Partial<React.ComponentProps<typeof ListaIntegrantes>> = {}) {
  const acciones = {
    onRenombrar: vi.fn(),
    onElegirHorario: vi.fn(),
    onQuitar: vi.fn(),
    onAgregar: vi.fn(),
  };
  render(<ListaIntegrantes integrantes={integrantes} puedeAgregar {...acciones} {...props} />);
  return acciones;
}

describe("ListaIntegrantes", () => {
  it("muestra a cada integrante con su servicio, maquilladora, día y hora de Lima", () => {
    dibujar([completa(1, "Ana"), completa(2, "Bea", { maquilladora: { id: 3, nombre: "Carla" } })]);
    const filas = screen.getAllByRole("listitem").filter((li) => within(li).queryByLabelText(/Nombre de la integrante/));
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByLabelText("Nombre de la integrante 1")).toHaveValue("Ana");
    expect(within(filas[0]).getByText(/Maquillaje social/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/jueves.*24.*diciembre/i)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/a las 09:00 \(hora de Lima\)/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/350\.50/)).toBeInTheDocument();
    expect(within(filas[1]).getByText("Carla")).toBeInTheDocument();
  });

  it("marca a la integrante sin horario", () => {
    dibujar([completa(1, "Ana"), { ...vacia(2), nombre: "Bea" }]);
    expect(screen.getAllByText("Falta elegir el horario.")).toHaveLength(1);
  });

  it("marca a la integrante sin nombre", () => {
    dibujar([completa(1, "Ana"), completa(2, "")]);
    expect(screen.getAllByText("Falta el nombre.")).toHaveLength(1);
  });

  it("una integrante recién agregada está incompleta en nombre y horario", () => {
    dibujar([completa(1, "Ana"), vacia(2)]);
    expect(screen.getByText("Falta el nombre.")).toBeInTheDocument();
    expect(screen.getByText("Falta elegir el horario.")).toBeInTheDocument();
  });

  it("escribir un nombre avisa con el identificador de esa integrante", async () => {
    const { onRenombrar } = dibujar([completa(1, "Ana"), vacia(2)]);
    await userEvent.setup().type(screen.getByLabelText("Nombre de la integrante 2"), "B");
    expect(onRenombrar).toHaveBeenCalledWith(uuid(2), "B");
  });

  it("el botón de horario dice Elegir si no tiene y Cambiar si ya tiene, y avisa su identificador", async () => {
    const { onElegirHorario } = dibujar([completa(1, "Ana"), vacia(2)]);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cambiar horario de Ana" }));
    await u.click(screen.getByRole("button", { name: "Elegir horario de la integrante 2" }));
    expect(onElegirHorario.mock.calls).toEqual([[uuid(1)], [uuid(2)]]);
  });

  it("quitar avisa el identificador de esa integrante", async () => {
    const { onQuitar } = dibujar([completa(1, "Ana"), completa(2, "Bea")]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Quitar a Bea" }));
    expect(onQuitar).toHaveBeenCalledExactlyOnceWith(uuid(2));
  });

  it("no se puede quitar a la única integrante", () => {
    dibujar([completa(1, "Ana")]);
    expect(screen.getByRole("button", { name: "Quitar a Ana" })).toBeDisabled();
  });

  it("agregar está habilitado y avisa cuando hay lugar", async () => {
    const { onAgregar } = dibujar([completa(1, "Ana"), completa(2, "Bea")]);
    const boton = screen.getByRole("button", { name: "Agregar integrante" });
    expect(boton).toBeEnabled();
    await userEvent.setup().click(boton);
    expect(onAgregar).toHaveBeenCalledOnce();
    expect(screen.queryByText(/admite hasta 10/)).toBeNull();
  });

  it("en el máximo de 10 deshabilita agregar y explica el límite", () => {
    dibujar(Array.from({ length: 10 }, (_, i) => completa(i + 1, `P${i + 1}`)), { puedeAgregar: false });
    expect(screen.getByRole("button", { name: "Agregar integrante" })).toBeDisabled();
    expect(screen.getByText("Un grupo admite hasta 10 integrantes.")).toBeInTheDocument();
  });

  it("los botones no envían el formulario que los contenga", () => {
    dibujar([completa(1, "Ana"), completa(2, "Bea")]);
    for (const boton of screen.getAllByRole("button")) expect(boton).toHaveAttribute("type", "button");
  });

  it("muestra los avisos solo en la integrante afectada y ofrece elegir otro horario", () => {
    dibujar([completa(1, "Ana"), completa(2, "Bea"), completa(3, "Carla")], {
      avisos: { 1: ["Ese horario ya no está disponible."] },
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Ese horario ya no está disponible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir otro horario de Bea" })).toBeInTheDocument();
    // Las demás conservan su horario y su botón normal.
    expect(screen.getByRole("button", { name: "Cambiar horario de Ana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar horario de Carla" })).toBeInTheDocument();
    expect(screen.getAllByText(/Maquillaje social/)).toHaveLength(3);
  });

  it("una integrante puede tener varios avisos", () => {
    dibujar([completa(1, "Ana"), completa(2, "Bea")], {
      avisos: { 0: ["Se solapa con Bea: tienen a la misma maquilladora a la vez.", "Ese horario ya no está disponible."] },
    });
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Se solapa con Bea"))).not.toHaveLength(0);
    expect(screen.getByText("Ese horario ya no está disponible.")).toBeInTheDocument();
  });

  it("indica cuál integrante está en edición", () => {
    dibujar([completa(1, "Ana"), completa(2, "Bea")], { personaActivaId: uuid(2) });
    expect(screen.getAllByText(/Eligiendo el horario de esta integrante/)).toHaveLength(1);
  });
});
