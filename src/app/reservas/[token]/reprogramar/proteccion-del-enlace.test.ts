import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../../../next.config";

// La página importa la base y las acciones; aquí solo interesa su `metadata`.
vi.mock("@/db", () => ({ getDb: vi.fn() }));

const { metadata } = await import("./page");

describe("la subruta de reprogramar hereda la protección del enlace (ADR 0004)", () => {
  it("la página no se indexa", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("la regla /reservas/:path* cubre cualquier subruta y no se cachea, ni se indexa, ni envía Referer", async () => {
    const reglas = (await nextConfig.headers?.()) ?? [];
    const regla = reglas.find((r) => r.source === "/reservas/:path*");
    // `:path*` acepta cero o más segmentos: `/reservas/<token>/reprogramar` entra.
    expect(regla?.source.endsWith(":path*")).toBe(true);
    expect(Object.fromEntries((regla?.headers ?? []).map((h) => [h.key, h.value]))).toEqual({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
  });
});
