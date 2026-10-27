import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Acceso a la agenda (horario semanal y bloqueos) de una maquilladora. */
export function EnlaceAgenda({ id, nombre }: { id: number; nombre: string }) {
  return (
    <Link
      href={`/admin/maquilladoras/${id}/agenda`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
      aria-label={`Agenda de ${nombre}`}
    >
      Agenda
    </Link>
  );
}
