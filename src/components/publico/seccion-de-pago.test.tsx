import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfiguracionDePago } from "@/lib/pago/configuracion";
import { SeccionDePago, type DatosDePago } from "./seccion-de-pago";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";
const config: ConfiguracionDePago = { qrUrl: "https://cdn.ejemplo.pe/qr-yape.png", billetera: "Yape" };

// 15:00 UTC = 10:00 en Lima.
const CREADA = new Date("2026-12-21T15:00:00Z");
const PLAZO = new Date(CREADA.getTime() + 20 * 60_000); // 10:20 en Lima

const datos = (extra: Partial<DatosDePago> = {}): DatosDePago => ({
  token: TOKEN,
  configuracion: config,
  accion: vi.fn(),
  ahora: new Date(CREADA.getTime() + 5 * 60_000),
  ...extra,
});

const dibujar = (d: DatosDePago, plazo: Date | null = PLAZO, monto = "350.50") =>
  render(<SeccionDePago datos={d} montoTotal={monto} plazoPagoHasta={plazo} />);

describe("SeccionDePago con el QR configurado", () => {
  it("muestra el QR con un texto alternativo que nombra la billetera", () => {
    dibujar(datos());
    const qr = screen.getByRole("img", { name: "Código QR para pagar con Yape" });
    expect(qr).toHaveAttribute("src", "https://cdn.ejemplo.pe/qr-yape.png");
  });

  it("muestra el monto exacto y las instrucciones", () => {
    dibujar(datos());
    expect(screen.getByText("350.50")).toBeInTheDocument();
    expect(screen.getByText(/Escaneá el QR con Yape/)).toBeInTheDocument();
    expect(screen.getByText(/Copiá el número de operación/)).toBeInTheDocument();
  });

  it("muestra el monto total de un grupo sin redondeos", () => {
    dibujar(datos(), PLAZO, "550.60");
    expect(screen.getByText("550.60")).toBeInTheDocument();
  });

  it("ofrece el campo del número y ningún campo para subir archivos", () => {
    const { container } = dibujar(datos());
    expect(screen.getByLabelText("Número de operación")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("usa el nombre por defecto de la billetera cuando no se configuró uno", () => {
    dibujar(datos({ configuracion: { qrUrl: "/qr.png", billetera: "la billetera del studio" } }));
    expect(screen.getByRole("img", { name: "Código QR para pagar con la billetera del studio" })).toHaveAttribute("src", "/qr.png");
  });
});

describe("plazo de pago", () => {
  it("dentro del plazo dice cuántos minutos tiene y hasta qué hora de Lima", () => {
    dibujar(datos());
    expect(screen.getByText(/Tenés 20 minutos desde que reservaste/)).toBeInTheDocument();
    expect(screen.getByText("10:20")).toBeInTheDocument();
    expect(screen.getByText(/hora de Lima/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("justo en el límite todavía está dentro del plazo", () => {
    dibujar(datos({ ahora: PLAZO }));
    expect(screen.getByText(/Tenés 20 minutos/)).toBeInTheDocument();
  });

  it("con el plazo pasado avisa que el horario podría haberse liberado y que aún puede ingresar su número", () => {
    dibujar(datos({ ahora: new Date(CREADA.getTime() + 25 * 60_000) }));
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(/plazo de 20 minutos ya pasó/);
    expect(aviso).toHaveTextContent(/era hasta las 10:20/);
    expect(aviso).toHaveTextContent(/podría haberse liberado/);
    expect(aviso).toHaveTextContent(/si nadie lo tomó todavía, podés ingresar tu número/);
    expect(screen.getByLabelText("Número de operación")).toBeInTheDocument();
  });

  it("una reserva devuelta por un rechazo no muestra ningún plazo", () => {
    dibujar(datos(), null);
    expect(screen.queryByText(/Tenés 20 minutos/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/plazo/i)).toBeNull();
    expect(screen.getByLabelText("Número de operación")).toBeInTheDocument();
  });
});

describe("SeccionDePago sin el QR configurado", () => {
  it("dice que el pago por QR todavía no está disponible", () => {
    dibujar(datos({ configuracion: null }));
    expect(screen.getByText(/El pago por QR todavía no está disponible/)).toBeInTheDocument();
  });

  it("no ofrece el campo del número, ni el QR, ni el botón", () => {
    dibujar(datos({ configuracion: null }));
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SeccionDePago devuelta por un rechazo", () => {
  const dibujarRechazada = (motivo: string | null, d: DatosDePago = datos()) =>
    render(<SeccionDePago datos={d} montoTotal="350.50" plazoPagoHasta={null} motivoRechazo={motivo} />);

  it("muestra el motivo del studio en un aviso junto al campo del número", () => {
    dibujarRechazada("número mal escrito");
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("El studio no pudo validar tu pago: número mal escrito. Ingresá el número de nuevo.");
    // El aviso está antes del campo del número, no después.
    const campo = screen.getByLabelText("Número de operación");
    expect(aviso.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no muestra el plazo de 20 minutos", () => {
    dibujarRechazada("no aparece");
    expect(screen.queryByText(/20 minutos/)).toBeNull();
  });

  it("sin rechazo no muestra ningún motivo", () => {
    dibujarRechazada(null);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/no pudo validar tu pago/)).toBeNull();
  });

  it("un motivo con caracteres HTML se muestra como texto, no como HTML", () => {
    const { container } = dibujarRechazada('<img src=x onerror="alert(1)"> y <b>negrita</b>');
    expect(screen.getByRole("status")).toHaveTextContent('<img src=x onerror="alert(1)"> y <b>negrita</b>');
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });

  it("sin QR configurado igual explica el motivo", () => {
    dibujarRechazada("no aparece", datos({ configuracion: null }));
    expect(screen.getByRole("status")).toHaveTextContent("no aparece");
    expect(screen.queryByLabelText("Número de operación")).toBeNull();
  });
});
