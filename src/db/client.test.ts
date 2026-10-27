import { describe, expect, it } from "vitest";
import { leerDatabaseUrl } from "./client";

describe("leerDatabaseUrl", () => {
  it("devuelve la URL cuando la variable está definida", () => {
    expect(leerDatabaseUrl({ DATABASE_URL: "postgresql://localhost/x" })).toBe(
      "postgresql://localhost/x",
    );
  });

  it("falla nombrando la variable cuando falta, sin exponer secretos", () => {
    expect(() => leerDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
