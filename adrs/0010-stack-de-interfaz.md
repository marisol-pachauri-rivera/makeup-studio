# ADR 0010: Tailwind CSS y shadcn/ui como stack de interfaz

## Estado

Aceptado

## Contexto

Next.js con TypeScript ya está decidido (ADR 0001 y ADR 0006). Falta la capa de interfaz para dos
superficies: el sitio público, usado por clientas principalmente desde el celular, y el panel
admin, con tablas, formularios y una agenda por maquilladora. El equipo es de una persona y el
negocio es de belleza, por lo que la identidad visual importa.

## Decisión

Tailwind CSS para estilos y shadcn/ui (componentes basados en Radix, copiados al repo) para los
componentes de interfaz, con diseño mobile-first en el sitio público.

## Alternativas consideradas

- **Material UI o Mantine** — muchos componentes listos (tablas, selectores de fecha), pero con
  aspecto más genérico, más difícil de adaptar a la identidad del studio, y bundle más pesado.
- **CSS Modules o CSS propio** — control total y sin dependencias, pero obliga a construir a mano
  todos los componentes, incluida su accesibilidad, algo costoso sobre todo para el panel.

## Consecuencias

- Desarrollo rápido de interfaces responsive y accesibles, con libertad para definir la identidad
  visual del studio.
- Los componentes de shadcn/ui viven en el repo: son código propio que se mantiene y actualiza a
  mano, sin actualizaciones automáticas de una librería.
- Requiere conocer Tailwind; el marcado con muchas clases utilitarias puede volverse verboso.
- Shadcn/ui no incluye una agenda o calendario completo por maquilladora; esa vista del panel
  requiere composición propia o una librería adicional (queda abierto).
