import { describe, expect, it } from "vitest";
import { mensajeDockerAusente, verificarAislamiento } from "./support/aislamiento";

describe("verificarAislamiento", () => {
  it("aborta si la URL de pruebas coincide con DATABASE_URL", () => {
    const url = "postgresql://localhost:5432/x";
    expect(() => verificarAislamiento(url, url)).toThrow(/DATABASE_URL/);
  });

  it("aborta si la URL de pruebas apunta a Neon", () => {
    expect(() => verificarAislamiento("postgresql://u:p@ep-1.neon.tech/db", undefined)).toThrow(/Neon/);
  });

  it("acepta una URL local distinta", () => {
    expect(() => verificarAislamiento("postgresql://localhost:5555/test", "postgresql://x/y")).not.toThrow();
  });
});

describe("mensajeDockerAusente", () => {
  it("indica cómo levantar la base y cómo correr solo los tests sin base", () => {
    const mensaje = mensajeDockerAusente(new Error("Could not find a working container runtime strategy"));
    expect(mensaje).toMatch(/Docker/);
    expect(mensaje).toMatch(/npm run test:unit/);
    expect(mensaje).toMatch(/container runtime/);
  });
});
