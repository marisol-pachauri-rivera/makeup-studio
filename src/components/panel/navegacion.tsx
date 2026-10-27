import Link from "next/link";

/** Secciones del panel. Las secciones nuevas se suman acá. */
export const SECCIONES_DEL_PANEL = [
  { href: "/admin/reservas", etiqueta: "Reservas", descripcion: "Validá pagos, rechazalos con un motivo o cancelá reservas." },
  { href: "/admin/agenda", etiqueta: "Agenda", descripcion: "Turnos del día por maquilladora." },
  { href: "/admin/reembolsos", etiqueta: "Reembolsos", descripcion: "Devoluciones pendientes de reservas canceladas." },
  { href: "/admin/servicios", etiqueta: "Servicios", descripcion: "Catálogo: precios, duración y qué se ofrece." },
  { href: "/admin/maquilladoras", etiqueta: "Maquilladoras", descripcion: "Quiénes atienden en el studio." },
] as const;

/** Enlaces de la cabecera del panel. */
export function NavegacionPanel() {
  return (
    <nav aria-label="Secciones del panel" className="flex items-center gap-4 text-sm">
      {SECCIONES_DEL_PANEL.map((s) => (
        <Link key={s.href} href={s.href} className="underline-offset-4 hover:underline">
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/** Accesos de la página de inicio del panel. */
export function AccesosDelPanel() {
  return (
    <ul className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {SECCIONES_DEL_PANEL.map((s) => (
        <li key={s.href}>
          <Link href={s.href} className="block rounded-lg border p-4 hover:bg-muted">
            <span className="font-medium">{s.etiqueta}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{s.descripcion}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
