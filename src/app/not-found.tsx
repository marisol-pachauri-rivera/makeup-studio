import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">No encontramos esa página</h1>
      <p className="max-w-sm text-muted-foreground">
        El enlace puede estar mal escrito o la página ya no existe.
      </p>
      <Link href="/" className={buttonVariants()}>
        Volver al inicio
      </Link>
    </main>
  );
}
