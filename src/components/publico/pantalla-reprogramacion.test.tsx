import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DiaConHuecos } from "@/lib/disponibilidad/huecos";
import type { MaquilladoraPublica } from "@/lib/publico/catalogo";
import type { EstadoFormulario, ResultadoFormulario } from "@/lib/reprogramacion/formulario";
import type { TurnoReprogramable } from "@/lib/reprogramacion/turnos";
import { PantallaReprogramacion } from "./pantalla-reprogramacion";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<ResultadoFormulario>;

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";
const ana = { id: 1, nombre: "Ana", activa: true } as MaquilladoraPublica;
const bea = { id: 2, nombre: "Bea", activa: true } as MaquilladoraPublica;

// 15:00 UTC = 10:00 en Lima.
const turno = (extra: Partial<TurnoReprogramable> = {}): TurnoReprogramable => ({
  id: 7,
  persona: "Lucía",
  servicio: "Peinado",
  maquilladora: "Ana",
  maquilladoraId: 1,
  inicio: new Date("2026-12-28T15:00:00Z"),
  fin: new Date("2026-12-28T16:00:00Z"),
  puedeReprogramar: true,
  ...extra,
});

const NUEVO = new Date("2026-12-29T17:00:00Z"); // 12:00 en Lima
const dia: DiaConHuecos = {
  fecha: "2026-12-29",
  inicios: [new Date("2026-12-29T14:00:00Z"), NUEVO],
};

const dibujar = (props: Partial<Parameters<typeof PantallaReprogramacion>[0]> = {}, accion: Accion = vi.fn<Accion>()) =>
  render(
    <PantallaReprogramacion
      token={TOKEN}
      turno={turno()}
      maquilladoras={[ana, bea]}
      accion={accion}
      dias={[]}
      {...props}
    />,
  );

describe("PantallaReprogramacion: elegir", () => {
  it("muestra el turno actual, que es el mismo servicio y que no se cobra de nuevo", () => {
    dibujar();
    expect(screen.getByRole("heading", { name: "Reprogramar tu turno" })).toBeInTheDocument();
    expect(screen.getByText(/Peinado para Lucía, con Ana/)).toHaveTextContent(/no se cobra de nuevo/);
  });

  it("ofrece cualquier maquilladora activa sin elegir ninguna", () => {
    dibujar();
    expect(screen.getByRole("link", { name: "Ana" })).toHaveAttribute("href", `/reservas/${TOKEN}/reprogramar?linea=7&maquilladora=1`);
    expect(screen.getByRole("link", { name: "Bea" })).toHaveAttribute("href", `/reservas/${TOKEN}/reprogramar?linea=7&maquilladora=2`);
    expect(screen.getByText("Elegí una maquilladora para ver sus horarios.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
  });

  it("con una maquilladora elegida muestra días y horarios como enlaces que conservan todo en la URL", () => {
    dibujar({ elegida: bea, dias: [dia], diaElegido: dia });
    const horarios = within(screen.getByRole("list", { name: "Horarios libres" }));
    expect(horarios.getByRole("link", { name: "Elegir el horario de las 12:00" })).toHaveAttribute(
      "href",
      `/reservas/${TOKEN}/reprogramar?linea=7&maquilladora=2&fecha=2026-12-29&inicio=${encodeURIComponent(NUEVO.toISOString())}`,
    );
    expect(screen.getByRole("link", { name: /29 dic/ })).toHaveAttribute("aria-current", "date");
  });

  it("sin horarios dice que pruebe con otra maquilladora", () => {
    dibujar({ elegida: bea });
    expect(screen.getByText(/Bea no tiene horarios disponibles/)).toBeInTheDocument();
  });

  it("elegir no cambia nada: no hay formulario de confirmación hasta que se elige un horario", () => {
    dibujar({ elegida: bea, dias: [dia], diaElegido: dia });
    expect(screen.queryByRole("button", { name: "Confirmar el cambio" })).toBeNull();
    expect(screen.getByText(/tu turno actual sigue igual hasta que confirmes/)).toBeInTheDocument();
  });
});

describe("PantallaReprogramacion: resumen y confirmación", () => {
  const conElegido = (accion?: Accion) =>
    dibujar({ elegida: bea, dias: [dia], diaElegido: dia, inicioElegido: NUEVO }, accion);

  it("muestra el resumen de X a Y y marca el horario elegido", () => {
    conElegido();
    const resumen = screen.getByRole("region", { name: "Resumen del cambio" });
    expect(resumen).toHaveTextContent(/lunes, 28 de diciembre a las 10:00 con Ana/i);
    expect(resumen).toHaveTextContent(/martes, 29 de diciembre a las 12:00 con Bea/i);
    expect(screen.getByRole("link", { name: "Elegir el horario de las 12:00" })).toHaveAttribute("aria-current", "true");
  });

  it("al confirmar manda el turno, el cambio y lo que la clienta vio", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({ estado: "reprogramada", token: TOKEN });
    conElegido(accion);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar el cambio" }));

    expect(Object.fromEntries(accion.mock.calls[0][1].entries())).toEqual({
      token: TOKEN,
      lineaId: "7",
      maquilladoraId: "2",
      inicio: NUEVO.toISOString(),
      inicioVisto: "2026-12-28T15:00:00.000Z",
      maquilladoraVistaId: "1",
    });
  });

  it("deshabilita el botón mientras envía", async () => {
    let terminar!: (r: ResultadoFormulario) => void;
    const accion = vi.fn<Accion>().mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    conElegido(accion);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar el cambio" }));

    expect(await screen.findByRole("button", { name: "Confirmando…" })).toBeDisabled();
    terminar({ estado: "rechazada", motivo: "turno_cambiado", mensaje: "Tu turno cambió." });
    expect(await screen.findByRole("button", { name: "Confirmar el cambio" })).toBeEnabled();
  });

  it("si el horario ya no está disponible avisa, conserva maquilladora y día y ofrece ver los horarios de nuevo", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "rechazada",
      motivo: "horario_no_disponible",
      mensaje: "Ese horario ya no está disponible. Elegí otro: tu turno original sigue igual.",
    });
    conElegido(accion);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar el cambio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("tu turno original sigue igual");
    expect(screen.getByRole("link", { name: "Ver los horarios de nuevo" })).toHaveAttribute(
      "href",
      `/reservas/${TOKEN}/reprogramar?linea=7&maquilladora=2&fecha=2026-12-29`,
    );
    // Sigue en la misma maquilladora y día.
    expect(screen.getByRole("heading", { name: "Horarios de Bea" })).toBeInTheDocument();
  });

  it("otros rechazos (como el plazo) muestran su mensaje sin el enlace de horarios", async () => {
    const accion = vi.fn<Accion>().mockResolvedValue({
      estado: "rechazada",
      motivo: "fuera_de_plazo",
      mensaje: "Ya no se puede reprogramar desde acá: faltan menos de 24 horas para tu turno. Escribile al studio.",
    });
    conElegido(accion);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar el cambio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Escribile al studio");
    expect(screen.queryByRole("link", { name: "Ver los horarios de nuevo" })).toBeNull();
  });

  it("ofrece no cambiar, volviendo a la página de estado", () => {
    conElegido();
    expect(screen.getByRole("link", { name: "No cambiar" })).toHaveAttribute("href", `/reservas/${TOKEN}`);
  });
});

describe("PantallaReprogramacion: plazo vencido", () => {
  it("no ofrece elegir nada y dice que escriba al studio", () => {
    dibujar({ turno: turno({ puedeReprogramar: false }) });
    expect(screen.getByRole("status")).toHaveTextContent(/menos de 24 horas.*Escribile al studio/);
    expect(screen.queryByRole("link", { name: "Ana" })).toBeNull();
    expect(screen.getByRole("link", { name: "Volver a mi reserva" })).toHaveAttribute("href", `/reservas/${TOKEN}`);
  });
});
