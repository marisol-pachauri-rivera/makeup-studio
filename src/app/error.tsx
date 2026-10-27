"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // El detalle va a la consola del navegador/servidor, nunca a la pantalla (ADR 0009).
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>
      <p className="max-w-sm text-muted-foreground">
        No pudimos cargar esta página. Probá de nuevo en unos instantes.
      </p>
      <Button onClick={() => retry()}>Reintentar</Button>
    </main>
  );
}
