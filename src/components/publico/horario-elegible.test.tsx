import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLAVE_ALMACENAMIENTO, actualizarContacto, leerAsistente } from "@/lib/reserva/asistente";
import { HorarioElegible } from "./horario-elegible";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const servicio = { id: 4, nombre: "Maquillaje social", precio: "350.50", duracionMinutos: 60 };
const maquilladora = { id: 2, nombre: "Lucía" };

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

function dibujar(inicio = "2026-12-24T14:00:00.000Z", hora = "09:00") {
  render(<HorarioElegible servicio={servicio} maquilladora={maquilladora} inicio={inicio} hora={hora} />);
  return screen.getByRole("button", { name: `Elegir el horario de las ${hora}` });
}

describe("HorarioElegible", () => {
  it("muestra la hora local", () => {
    expect(dibujar().textContent).toBe("09:00");
  });

  it("al elegirlo guarda la selección en sessionStorage y va al paso de confirmación", async () => {
    await userEvent.setup().click(dibujar());

    const estado = leerAsistente(sessionStorage);
    expect(estado).toMatchObject({ version: 1, servicio, maquilladora, inicio: "2026-12-24T14:00:00.000Z" });
    expect(estado?.clave).toMatch(/^[0-9a-f-]{36}$/);
    expect(estado?.contacto).toEqual({ nombre: "", telefono: "" });
    expect(push).toHaveBeenCalledExactlyOnceWith("/reservar");
  });

  it("elegir otro horario cambia la clave y conserva el contacto escrito", async () => {
    const u = userEvent.setup();
    await u.click(dibujar("2026-12-24T14:00:00.000Z", "09:00"));
    const primera = leerAsistente(sessionStorage);
    actualizarContacto(sessionStorage, { nombre: "Ana", telefono: "999111222" });

    document.body.innerHTML = "";
    await u.click(dibujar("2026-12-24T15:00:00.000Z", "10:00"));

    const segunda = leerAsistente(sessionStorage);
    expect(segunda?.clave).not.toBe(primera?.clave);
    expect(segunda?.inicio).toBe("2026-12-24T15:00:00.000Z");
    expect(segunda?.contacto).toEqual({ nombre: "Ana", telefono: "999111222" });
  });

  it("no escribe nada en el servidor: solo toca el almacenamiento del navegador", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    await userEvent.setup().click(dibujar());
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CLAVE_ALMACENAMIENTO)).not.toBeNull();
    fetchEspia.mockRestore();
  });

  it("si el almacenamiento no se puede usar igual navega (el paso de confirmación lo explicará)", async () => {
    const espia = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await userEvent.setup().click(dibujar());
    expect(push).toHaveBeenCalledExactlyOnceWith("/reservar");
    espia.mockRestore();
  });
});
