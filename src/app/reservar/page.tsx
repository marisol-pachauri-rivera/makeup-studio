import { PasoConfirmacion } from "@/components/publico/paso-confirmacion";
import { confirmarReserva } from "./actions";

// El paso de confirmación no se indexa: depende de lo que la clienta guardó en su navegador.
export const metadata = {
  title: "Confirmar reserva | Studio de Maquillaje",
  robots: { index: false, follow: false },
};

export default function PaginaReservar() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Confirmá tu reserva</h1>
      <PasoConfirmacion accion={confirmarReserva} />
    </main>
  );
}
