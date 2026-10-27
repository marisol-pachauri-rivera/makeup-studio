import { describe, expect, it, vi } from "vitest";
import { procesarConfirmacion } from "./confirmacion";
import type { ResultadoReserva } from "./crear";
import type { ResultadoGrupo } from "./crear-grupal";

const valida = {
  clave: "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10",
  servicioId: "4",
  maquilladoraId: "2",
  inicio: "2026-12-24T14:00:00.000Z",
  nombre: "Lucía",
  telefono: "999111222",
};

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const creando = (resultado: ResultadoReserva) => vi.fn().mockResolvedValue(resultado);
const grupoCreando = (resultado: ResultadoGrupo) => vi.fn().mockResolvedValue(resultado);
const sinGrupo = () => vi.fn();

describe("procesarConfirmacion: reserva individual", () => {
  it("con datos válidos crea y devuelve el token", async () => {
    const crear = creando({ estado: "creada", token: "tok-1", repetida: false });
    const crearGrupo = sinGrupo();
    expect(await procesarConfirmacion(form(valida), { crear, crearGrupo })).toEqual({ estado: "ok", token: "tok-1" });
    expect(crear).toHaveBeenCalledOnce();
    expect(crearGrupo).not.toHaveBeenCalled();
    const solicitud = crear.mock.calls[0][0];
    expect(solicitud).toMatchObject({ servicioId: 4, maquilladoraId: 2, nombre: "Lucía", telefono: "999111222" });
    expect(solicitud.inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
  });

  it("una reserva repetida (misma clave) también es ok y trae el mismo token", async () => {
    const crear = creando({ estado: "creada", token: "tok-1", repetida: true });
    expect(await procesarConfirmacion(form(valida), { crear, crearGrupo: sinGrupo() })).toEqual({ estado: "ok", token: "tok-1" });
  });

  it.each(["horario_no_disponible", "no_disponible"] as const)("traslada el resultado %s", async (estado) => {
    expect(await procesarConfirmacion(form(valida), { crear: creando({ estado }), crearGrupo: sinGrupo() })).toEqual({ estado });
  });

  it("con datos inválidos devuelve errores por campo y lo escrito, sin tocar la base", async () => {
    const crear = vi.fn();
    const r = await procesarConfirmacion(form({ ...valida, nombre: "   ", telefono: "abc" }), { crear, crearGrupo: sinGrupo() });
    expect(r).toMatchObject({
      estado: "invalido",
      errores: { nombre: "El nombre es obligatorio.", telefono: expect.any(String) },
      valores: { nombre: "   ", telefono: "abc", servicioId: "4" },
    });
    expect(crear).not.toHaveBeenCalled();
  });

  it("una clave o un horario manipulados se rechazan sin tocar la base", async () => {
    const crear = vi.fn();
    const r = await procesarConfirmacion(form({ ...valida, clave: "x", inicio: "mañana", servicioId: "abc" }), {
      crear,
      crearGrupo: sinGrupo(),
    });
    expect(r).toMatchObject({
      estado: "invalido",
      errores: { clave: expect.any(String), inicio: expect.any(String), servicioId: expect.any(String) },
    });
    expect(crear).not.toHaveBeenCalled();
  });

  it("trata los campos ausentes como inválidos", async () => {
    const crear = vi.fn();
    const r = await procesarConfirmacion(new FormData(), { crear, crearGrupo: sinGrupo() });
    expect(r.estado).toBe("invalido");
    if (r.estado !== "invalido") throw new Error("inválido esperado");
    expect(Object.keys(r.errores).sort()).toEqual(["clave", "inicio", "maquilladoraId", "nombre", "servicioId", "telefono"]);
    expect(r.valores.nombre).toBe("");
    expect(crear).not.toHaveBeenCalled();
  });

  it("un archivo en lugar de texto es un dato inválido", async () => {
    const fd = form(valida);
    fd.set("nombre", new File(["x"], "x.txt"));
    const r = await procesarConfirmacion(fd, { crear: vi.fn(), crearGrupo: sinGrupo() });
    expect(r).toMatchObject({ estado: "invalido", errores: { nombre: expect.any(String) }, valores: { nombre: "" } });
  });

  it("un error inesperado de la capa de datos se relanza", async () => {
    const crear = vi.fn().mockRejectedValue(new Error("se cayó la base"));
    await expect(procesarConfirmacion(form(valida), { crear, crearGrupo: sinGrupo() })).rejects.toThrow("se cayó la base");
  });
});

// --- Reserva grupal ------------------------------------------------------------------------------

const integrante = (extra: Record<string, unknown> = {}) => ({
  nombre: "Ana",
  servicioId: 4,
  maquilladoraId: 2,
  inicio: "2026-12-24T14:00:00.000Z",
  ...extra,
});

const campos = (personas: unknown, extra: Record<string, string> = {}) => ({
  clave: valida.clave,
  nombre: "Lucía",
  telefono: "999111222",
  personas: typeof personas === "string" ? personas : JSON.stringify(personas),
  ...extra,
});

describe("procesarConfirmacion: reserva grupal", () => {
  it("el campo personas despacha al grupo, no a la reserva individual", async () => {
    const crear = vi.fn();
    const crearGrupo = grupoCreando({ estado: "creada", token: "tok-g", repetida: false });

    const r = await procesarConfirmacion(form(campos([integrante(), integrante({ nombre: "Bea", maquilladoraId: 3 })])), {
      crear,
      crearGrupo,
    });

    expect(r).toEqual({ estado: "ok", token: "tok-g" });
    expect(crear).not.toHaveBeenCalled();
    const solicitud = crearGrupo.mock.calls[0][0];
    expect(solicitud).toMatchObject({ nombre: "Lucía", telefono: "999111222" });
    expect(solicitud.personas).toHaveLength(2);
    expect(solicitud.personas[1]).toMatchObject({ nombre: "Bea", servicioId: 4, maquilladoraId: 3 });
    expect(solicitud.personas[0].inicio.toISOString()).toBe("2026-12-24T14:00:00.000Z");
  });

  it("un grupo repetido (misma clave) también es ok y trae el mismo token", async () => {
    const crearGrupo = grupoCreando({ estado: "creada", token: "tok-g", repetida: true });
    const r = await procesarConfirmacion(form(campos([integrante(), integrante()])), { crear: vi.fn(), crearGrupo });
    expect(r).toEqual({ estado: "ok", token: "tok-g" });
  });

  it("traslada qué integrantes impiden el grupo", async () => {
    const crearGrupo = grupoCreando({
      estado: "rechazada",
      noDisponibles: [2],
      horariosNoDisponibles: [1],
      solapamientos: [[0, 3]],
    });
    const r = await procesarConfirmacion(form(campos([integrante(), integrante(), integrante(), integrante()])), {
      crear: vi.fn(),
      crearGrupo,
    });
    expect(r).toEqual({
      estado: "grupo_rechazado",
      noDisponibles: [2],
      horariosNoDisponibles: [1],
      solapamientos: [[0, 3]],
    });
  });

  it("señala por ruta a la integrante con errores y no toca la base", async () => {
    const crearGrupo = vi.fn();
    const r = await procesarConfirmacion(form(campos([integrante(), integrante({ nombre: "  " }), integrante({ inicio: undefined })])), {
      crear: vi.fn(),
      crearGrupo,
    });
    expect(r).toMatchObject({
      estado: "invalido",
      errores: { "personas.1.nombre": "El nombre es obligatorio.", "personas.2.inicio": "Falta elegir el horario." },
      valores: { nombre: "Lucía", telefono: "999111222" },
    });
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it("repuebla a quien reserva cuando el error está en el contacto", async () => {
    const r = await procesarConfirmacion(form(campos([integrante(), integrante()], { nombre: "", telefono: "abc" })), {
      crear: vi.fn(),
      crearGrupo: vi.fn(),
    });
    expect(r).toMatchObject({
      estado: "invalido",
      errores: { nombre: expect.any(String), telefono: expect.any(String) },
      valores: { nombre: "", telefono: "abc" },
    });
  });

  it.each([
    ["JSON roto", "{no es json"],
    ["texto vacío", ""],
    ["un objeto", '{"0":{"nombre":"Ana"}}'],
    ["un número", "42"],
    ["null", "null"],
  ])("personas con %s es una solicitud inválida, nunca una excepción", async (_caso, personas) => {
    const crearGrupo = vi.fn();
    const r = await procesarConfirmacion(form(campos(personas)), { crear: vi.fn(), crearGrupo });
    expect(r).toMatchObject({ estado: "invalido", errores: { personas: expect.any(String) } });
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it("un archivo en personas es una solicitud inválida", async () => {
    const fd = form(campos([integrante(), integrante()]));
    fd.set("personas", new File(["[]"], "personas.json"));
    const crearGrupo = vi.fn();
    const r = await procesarConfirmacion(fd, { crear: vi.fn(), crearGrupo });
    expect(r).toMatchObject({ estado: "invalido", errores: { personas: expect.any(String) } });
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it("una sola integrante o más de diez se rechazan sin tocar la base", async () => {
    const crearGrupo = vi.fn();
    const una = await procesarConfirmacion(form(campos([integrante()])), { crear: vi.fn(), crearGrupo });
    const once = await procesarConfirmacion(form(campos(Array.from({ length: 11 }, () => integrante()))), {
      crear: vi.fn(),
      crearGrupo,
    });
    expect(una).toMatchObject({ estado: "invalido", errores: { personas: expect.stringContaining("individual") } });
    expect(once).toMatchObject({ estado: "invalido", errores: { personas: expect.stringContaining("hasta 10") } });
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it("los campos de la reserva individual no se mezclan con los del grupo", async () => {
    const crear = vi.fn();
    const crearGrupo = grupoCreando({ estado: "creada", token: "tok-g", repetida: false });
    // Un envío manipulado con campos de ambos tipos se trata como grupo (decide `personas`).
    const r = await procesarConfirmacion(form({ ...valida, ...campos([integrante(), integrante()]) }), { crear, crearGrupo });
    expect(r).toEqual({ estado: "ok", token: "tok-g" });
    expect(crear).not.toHaveBeenCalled();
  });

  it("un error inesperado de la capa de datos se relanza", async () => {
    const crearGrupo = vi.fn().mockRejectedValue(new Error("se cayó la base"));
    await expect(
      procesarConfirmacion(form(campos([integrante(), integrante()])), { crear: vi.fn(), crearGrupo }),
    ).rejects.toThrow("se cayó la base");
  });
});
