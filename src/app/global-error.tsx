"use client";

import { useEffect } from "react";

// Reemplaza al layout raíz y no recibe los estilos globales: se mantiene autocontenido.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Algo salió mal</title>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Algo salió mal</h1>
        <p style={{ maxWidth: "24rem", margin: 0, color: "#555" }}>
          No pudimos cargar el sitio. Probá de nuevo en unos instantes.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            borderRadius: "0.5rem",
            border: 0,
            background: "#171717",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
