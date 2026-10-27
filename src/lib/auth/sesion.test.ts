import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const buscarAdminDeSesion = vi.fn();
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ getDb: () => "db-falsa" }));
vi.mock("./admin-activa", () => ({ buscarAdminDeSesion }));
vi.mock("next/navigation", () => ({ redirect }));

const { NoAutorizado, requerirAdmin, requerirAdminOLogin } = await import("./sesion");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requerirAdmin (Server Actions)", () => {
  it("sin administradora válida lanza NoAutorizado", async () => {
    auth.mockResolvedValue(null);
    buscarAdminDeSesion.mockResolvedValue(null);
    await expect(requerirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });

  it("con administradora válida la devuelve", async () => {
    auth.mockResolvedValue({ user: { id: "7" } });
    buscarAdminDeSesion.mockResolvedValue({ id: 7, usuario: "maria" });
    await expect(requerirAdmin()).resolves.toEqual({ id: 7, usuario: "maria" });
    expect(buscarAdminDeSesion).toHaveBeenCalledWith("db-falsa", { user: { id: "7" } });
  });

  it("una sesión cuya administradora ya no existe falla igual", async () => {
    auth.mockResolvedValue({ user: { id: "7" } });
    buscarAdminDeSesion.mockResolvedValue(null);
    await expect(requerirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });
});

describe("requerirAdminOLogin (páginas)", () => {
  it("sin sesión redirige al login", async () => {
    auth.mockResolvedValue(null);
    buscarAdminDeSesion.mockResolvedValue(null);
    await expect(requerirAdminOLogin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("con sesión válida devuelve a la administradora sin redirigir", async () => {
    auth.mockResolvedValue({ user: { id: "7" } });
    buscarAdminDeSesion.mockResolvedValue({ id: 7, usuario: "maria" });
    await expect(requerirAdminOLogin()).resolves.toEqual({ id: 7, usuario: "maria" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
