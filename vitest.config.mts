import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ruta = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": ruta("./src"),
      // En Next este módulo lanza fuera del servidor; en tests no hay distinción.
      "server-only": ruta("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
          exclude: ["src/**/*.int.test.{ts,tsx}", "tests/**/*.int.test.ts"],
          setupFiles: ["tests/setup-dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.{ts,tsx}", "tests/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["tests/global-setup.ts"],
          // Un contenedor y una base compartidos: los archivos corren en serie.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
