import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../../next.config";

// La página importa la base y las acciones; aquí solo interesa su `metadata`.
vi.mock("@/db", () => ({ getDb: vi.fn() }));

const { metadata } = await import("./page");

describe("el enlace con token sigue protegido (ADR 0004) tras sumar la cancelación", () => {
  it("la página no se indexa", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("las cabeceras cubren /reservas/:path* sin caché, sin indexar y sin Referer", async () => {
    const reglas = (await nextConfig.headers?.()) ?? [];
    const cabeceras = Object.fromEntries(
      reglas.filter((r) => r.source === "/reservas/:path*").flatMap((r) => r.headers.map((h) => [h.key, h.value])),
    );
    expect(cabeceras).toEqual({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
  });
});
