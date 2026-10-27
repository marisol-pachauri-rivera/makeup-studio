import { beforeEach, describe, expect, it, vi } from "vitest";

class NoAutorizado extends Error {}

const requerirAdmin = vi.fn();
const getDb = vi.fn(() => "db-falsa");
const reembolsos = { marcarReembolsoRealizado: vi.fn() };
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/sesion", () => ({ requerirAdmin }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/lib/cancelacion/reembolsos", () => reembolsos);
vi.mock("next/cache", () => ({ revalidatePath }));

const { marcarReembolso } = await import("./actions");

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const inicial = { estado: "inicial" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  requerirAdmin.mockResolvedValue({ id: 1, usuario: "maria" });
});

describe("marcarReembolso", () => {
  it("sin sesión válida se rechaza sin tocar la base", async () => {
    requerirAdmin.mockRejectedValue(new NoAutorizado());
    await expect(marcarReembolso(inicial, form({ id: "3" }))).rejects.toBeInstanceOf(NoAutorizado);
    expect(getDb).not.toHaveBeenCalled();
    expect(reembolsos.marcarReembolsoRealizado).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("marca con la base real y revalida la lista", async () => {
    reembolsos.marcarReembolsoRealizado.mockResolvedValue({ estado: "realizado" });
    expect(await marcarReembolso(inicial, form({ id: "3" }))).toEqual({ estado: "aplicada" });
    expect(reembolsos.marcarReembolsoRealizado).toHaveBeenCalledWith("db-falsa", 3);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/reembolsos");
  });

  it("un id inválido no llega a la base", async () => {
    expect(await marcarReembolso(inicial, form({ id: "abc" }))).toMatchObject({ estado: "aviso" });
    expect(reembolsos.marcarReembolsoRealizado).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un reembolso que no aplica da un aviso y no revalida", async () => {
    reembolsos.marcarReembolsoRealizado.mockResolvedValue({ estado: "no_aplica" });
    expect(await marcarReembolso(inicial, form({ id: "3" }))).toMatchObject({ estado: "aviso" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un error inesperado se relanza", async () => {
    reembolsos.marcarReembolsoRealizado.mockRejectedValue(new Error("la base se cayó"));
    await expect(marcarReembolso(inicial, form({ id: "3" }))).rejects.toThrow("la base se cayó");
  });
});
