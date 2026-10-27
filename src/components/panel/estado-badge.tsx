import { Badge } from "@/components/ui/badge";

/** Estado del registro con texto y color: no depende solo del color para distinguir inactivos. */
export function EstadoBadge({
  activo,
  textos = ["Activo", "Inactivo"],
}: {
  activo: boolean;
  textos?: readonly [activo: string, inactivo: string];
}) {
  return activo ? <Badge>{textos[0]}</Badge> : <Badge variant="outline">{textos[1]}</Badge>;
}
