import { describe, expect, it, vi } from "vitest";
import { MENSAJE_NUMERO_USADO, procesarIngreso } from "./formulario";
import type { ResultadoIngreso } from "./ingreso";

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const respondiendo = (resultado: ResultadoIngreso) => vi.fn().mockResolvedValue(resultado);

describe("procesarIngreso", () => {
  it("con un número válido informa el pago con el número normalizado", async () => {
    const ingresar = respondiendo({ estado: "registrado" });
    expect(await procesarIngreso(form({ token: TOKEN, numero: " op-123456 " }), { ingresar })).toEqual({ estado: "registrado" });
    expect(ingresar).toHaveBeenCalledExactlyOnceWith({ token: TOKEN, numero: "OP-123456" });
  });

  it("un número vacío se rechaza junto al campo y no toca la base", async () => {
    const ingresar = vi.fn();
    const r = await procesarIngreso(form({ token: TOKEN, numero: "   " }), { ingresar });
    expect(r).toEqual({
      estado: "invalido",
      errores: { numero: "Ingresá el número de operación." },
      valores: { numero: "   " },
    });
    expect(ingresar).not.toHaveBeenCalled();
  });

  it("un formato inválido se rechaza junto al campo, conserva lo escrito y no toca la base", async () => {
    const ingresar = vi.fn();
    const r = await procesarIngreso(form({ token: TOKEN, numero: "12 34" }), { ingresar });
    expect(r).toMatchObject({
      estado: "invalido",
      errores: { numero: expect.stringContaining("entre 4 y 30 caracteres") },
      valores: { numero: "12 34" },
    });
    expect(ingresar).not.toHaveBeenCalled();
  });

  it("un número ya usado se muestra junto al campo, con lo escrito, sin avisos aparte", async () => {
    const r = await procesarIngreso(form({ token: TOKEN, numero: "op-9999" }), { ingresar: respondiendo({ estado: "numero_usado" }) });
    expect(r).toEqual({ estado: "invalido", errores: { numero: MENSAJE_NUMERO_USADO }, valores: { numero: "op-9999" } });
  });

  it.each([
    ["vencida", /venció.*20 minutos.*Elegí otro horario/],
    ["cancelada", /fue cancelada/],
    ["pago_ya_informado", /Ya informaste el pago.*otro número.*revisando/],
    ["ya_confirmada", /ya está confirmada/],
    ["no_encontrada", /No encontramos tu reserva/],
  ] as const)("el resultado %s se muestra como un aviso con su texto", async (motivo, texto) => {
    const r = await procesarIngreso(form({ token: TOKEN, numero: "OP-1234" }), { ingresar: respondiendo({ estado: motivo }) });
    expect(r).toMatchObject({ estado: "rechazado", motivo, mensaje: expect.stringMatching(texto) });
  });

  it("un token inválido es 'reserva no encontrada' sin llegar a la base ni decir que el formato era el problema", async () => {
    const ingresar = vi.fn();
    const r = await procesarIngreso(form({ token: "abc", numero: "OP-1234" }), { ingresar });
    expect(r).toMatchObject({ estado: "rechazado", motivo: "no_encontrada" });
    expect(JSON.stringify(r)).not.toMatch(/uuid|formato/i);
    expect(ingresar).not.toHaveBeenCalled();
  });

  it("un token inválido con un número inválido gana el 'no encontrada' (no se revela nada más)", async () => {
    const r = await procesarIngreso(form({ token: "abc", numero: "" }), { ingresar: vi.fn() });
    expect(r).toMatchObject({ estado: "rechazado", motivo: "no_encontrada" });
  });

  it("campos ausentes: sin token es no encontrada, sin número se pide el número", async () => {
    expect(await procesarIngreso(new FormData(), { ingresar: vi.fn() })).toMatchObject({ estado: "rechazado", motivo: "no_encontrada" });
    expect(await procesarIngreso(form({ token: TOKEN }), { ingresar: vi.fn() })).toMatchObject({
      estado: "invalido",
      errores: { numero: "Ingresá el número de operación." },
      valores: { numero: "" },
    });
  });

  it("un archivo en lugar del número es un dato inválido con el campo vacío", async () => {
    const fd = form({ token: TOKEN });
    fd.set("numero", new File(["x"], "comprobante.png"));
    const ingresar = vi.fn();
    const r = await procesarIngreso(fd, { ingresar });
    expect(r).toMatchObject({ estado: "invalido", errores: { numero: expect.any(String) }, valores: { numero: "" } });
    expect(ingresar).not.toHaveBeenCalled();
  });

  it("un error inesperado de la capa de datos se relanza", async () => {
    const ingresar = vi.fn().mockRejectedValue(new Error("se cayó la base"));
    await expect(procesarIngreso(form({ token: TOKEN, numero: "OP-1234" }), { ingresar })).rejects.toThrow("se cayó la base");
  });
});
