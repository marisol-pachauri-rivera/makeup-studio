import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn(() => "db-falsa");
const reprogramarTurno = vi.fn();
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/reprogramacion/reprogramar", () => ({ reprogramarTurno }));
vi.mock("next/navigation", () => ({ redirect }));

const { reprogramar } = await import("./actions");

const TOKEN = "3f0c8d3e-6a52-4b8e-9d57-1f6f4a2c9b10";

function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  const campos = {
    token: TOKEN,
    lineaId: "7",
    maquilladoraId: "2",
    inicio: "2026-12-28T17:00:00.000Z",
    inicioVisto: "2026-12-28T15:00:00.000Z",
    maquilladoraVistaId: "1",
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("reprogramar", () => {
  it("al éxito reprograma con la base y el reloj del servidor y vuelve a la página de estado", async () => {
    reprogramarTurno.mockResolvedValue({ estado: "reprogramada", repetida: false });

    await expect(reprogramar({ estado: "inicial" }, form())).rejects.toThrow(`REDIRECT:/reservas/${TOKEN}`);

    expect(reprogramarTurno).toHaveBeenCalledExactlyOnceWith(
      "db-falsa",
      expect.objectContaining({ token: TOKEN, lineaId: 7, maquilladoraId: 2 }),
      expect.any(Date),
    );
  });

  it("no exige sesión: el enlace es la credencial (no pide requerirAdmin)", async () => {
    reprogramarTurno.mockResolvedValue({ estado: "horario_no_disponible" });
    await expect(reprogramar({ estado: "inicial" }, form())).resolves.toMatchObject({ estado: "rechazada" });
  });

  it.each(["horario_no_disponible", "fuera_de_plazo", "no_reprogramable", "turno_cambiado", "no_encontrada", "maquilladora_no_disponible"] as const)(
    "un rechazo (%s) devuelve el aviso y no redirige",
    async (estado) => {
      reprogramarTurno.mockResolvedValue({ estado });
      expect(await reprogramar({ estado: "inicial" }, form())).toMatchObject({ estado: "rechazada", motivo: estado });
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("con una entrada inválida no toca la base", async () => {
    expect(await reprogramar({ estado: "inicial" }, form({ token: "x" }))).toMatchObject({ motivo: "no_encontrada" });
    expect(getDb).not.toHaveBeenCalled();
    expect(reprogramarTurno).not.toHaveBeenCalled();
  });

  it("relanza un error inesperado", async () => {
    reprogramarTurno.mockRejectedValue(new Error("se cayó la base"));
    await expect(reprogramar({ estado: "inicial" }, form())).rejects.toThrow("se cayó la base");
    expect(redirect).not.toHaveBeenCalled();
  });
});
