import { describe, expect, it } from "vitest";
import { BILLETERA_POR_DEFECTO, leerConfiguracionDePago } from "./configuracion";

describe("leerConfiguracionDePago", () => {
  it("acepta una URL https y el nombre de la billetera", () => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "https://cdn.ejemplo.pe/qr.png", BILLETERA_NOMBRE: "Yape" })).toEqual({
      qrUrl: "https://cdn.ejemplo.pe/qr.png",
      billetera: "Yape",
    });
  });

  it("acepta una ruta de public/ del propio sitio", () => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "/qr-pago.png" })?.qrUrl).toBe("/qr-pago.png");
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "/pago/qr_studio-1.svg" })?.qrUrl).toBe("/pago/qr_studio-1.svg");
  });

  it("recorta los espacios alrededor", () => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "  /qr.png  ", BILLETERA_NOMBRE: "  Plin  " })).toEqual({
      qrUrl: "/qr.png",
      billetera: "Plin",
    });
  });

  it("usa un nombre por defecto si no se configura la billetera", () => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "/qr.png" })?.billetera).toBe(BILLETERA_POR_DEFECTO);
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "/qr.png", BILLETERA_NOMBRE: "   " })?.billetera).toBe(BILLETERA_POR_DEFECTO);
  });

  it("acota el largo del nombre de la billetera", () => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: "/qr.png", BILLETERA_NOMBRE: "a".repeat(200) })?.billetera).toHaveLength(60);
  });

  it.each([undefined, "", "   "])("devuelve null sin QR (%j)", (qr) => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: qr })).toBeNull();
    expect(leerConfiguracionDePago({})).toBeNull();
  });

  it.each([
    "http://ejemplo.pe/qr.png", // sin https
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "ftp://ejemplo.pe/qr.png",
    "//otro-sitio.com/qr.png", // misma URL con otro destino
    "/../secreto.png", // sale de public/
    "/pago/../../x.png",
    "qr.png", // ruta relativa
    "https://",
    "no es una url",
    "/con espacio.png",
  ])("rechaza %j", (qr) => {
    expect(leerConfiguracionDePago({ QR_PAGO_URL: qr, BILLETERA_NOMBRE: "Yape" })).toBeNull();
  });

  it("lee del entorno del proceso por defecto", () => {
    const antes = { qr: process.env.QR_PAGO_URL, nombre: process.env.BILLETERA_NOMBRE };
    process.env.QR_PAGO_URL = "/qr-entorno.png";
    delete process.env.BILLETERA_NOMBRE;
    try {
      expect(leerConfiguracionDePago()).toEqual({ qrUrl: "/qr-entorno.png", billetera: BILLETERA_POR_DEFECTO });
    } finally {
      if (antes.qr === undefined) delete process.env.QR_PAGO_URL;
      else process.env.QR_PAGO_URL = antes.qr;
      if (antes.nombre !== undefined) process.env.BILLETERA_NOMBRE = antes.nombre;
    }
  });
});
