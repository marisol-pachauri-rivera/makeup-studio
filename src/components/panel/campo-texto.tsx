import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  id: string;
  etiqueta: string;
  /** Mensaje de error del servidor para este campo. */
  error?: string;
  ayuda?: string;
  multilinea?: boolean;
} & Omit<ComponentProps<"input">, "id" | "children">;

/** Campo de formulario del panel: etiqueta, control y mensaje de error enlazados para lectores de pantalla. */
export function CampoTexto({ id, etiqueta, error, ayuda, multilinea, ...control }: Props) {
  const descripciones = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  const comunes = {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": descripciones || undefined,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {multilinea ? (
        <Textarea {...comunes} {...(control as ComponentProps<"textarea">)} />
      ) : (
        <Input {...comunes} {...control} />
      )}
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
