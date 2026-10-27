import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

async function cabecerasDe(source: string) {
  const reglas = (await nextConfig.headers?.()) ?? [];
  return Object.fromEntries(
    reglas.filter((r) => r.source === source).flatMap((r) => r.headers.map((h) => [h.key, h.value])),
  );
}

describe("cabeceras de las rutas que llevan o muestran el token", () => {
  it.each(["/reservas/:path*", "/reservar"])("%s no se cachea, no se indexa y no se envía como referencia", async (source) => {
    expect(await cabecerasDe(source)).toEqual({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
  });

  it("el panel conserva su protección", async () => {
    expect(await cabecerasDe("/admin/:path*")).toMatchObject({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });

  it("el catálogo público no se marca como no indexable", async () => {
    expect(await cabecerasDe("/")).toEqual({});
    expect(await cabecerasDe("/servicios/:path*")).toEqual({});
  });
});
