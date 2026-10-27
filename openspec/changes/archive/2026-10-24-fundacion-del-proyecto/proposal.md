# Proposal

## Why

El repositorio es greenfield: no hay aplicación, dependencias ni código. Los ítems #2 a #14 del
`BACKLOG.md` (modelo de datos, auth, panel, reserva, pagos) necesitan una base común sobre la que
construirse. Hay que dejar lista esa base, con las decisiones ya tomadas en los ADRs 0001, 0002,
0009 y 0010, antes de escribir cualquier funcionalidad de negocio.

## What Changes

Este cambio cubre **únicamente el ítem #1 del backlog**, "Fundación del proyecto":

- Crear la aplicación Next.js + TypeScript como monolito único (ADR 0001), con los scripts que
  ya declara `CLAUDE.md` (`dev`, `build`, `start`, `lint`, `test`).
- Configurar Tailwind CSS y shadcn/ui con enfoque mobile-first (ADR 0010).
- Configurar Drizzle ORM sobre el driver serverless de Neon, con la configuración de migraciones
  versionadas en SQL listas para usar (ADR 0002). No se define ninguna tabla.
- Agregar una capa de acceso a datos con **reintento acotado** ante fallos de conexión por
  suspensión de Neon (ADR 0009).
- Agregar **páginas de error amigables** (error de ruta, error global y 404) que no muestran
  detalles técnicos (ADR 0009).
- Elegir e instalar el **framework de testing con Postgres real**, y documentar la decisión en un
  **ADR nuevo (0011)**, como exige el backlog.
- Documentar las variables de entorno requeridas y mantener `CLAUDE.md` coherente con el
  framework de testing elegido.

Fuera de este cambio (pertenecen a otros ítems): las 7 entidades y la restricción de exclusión
(#2), Auth.js (#3), Zod en Server Actions, el catálogo y cualquier pantalla de negocio, la
idempotencia y las transacciones de reserva (#7), y cualquier pipeline de CI o despliegue.

## Capabilities

### New Capabilities

- `resilient-data-access`: acceso a la base Neon con Drizzle, que reintenta de forma acotada los
  fallos de conexión por suspensión y falla con un error claro cuando se agotan los intentos.
- `friendly-error-pages`: páginas de error propias que la clienta ve ante errores inesperados o
  rutas inexistentes, sin mostrar información técnica.
- `integration-testing`: entorno de pruebas que ejecuta los tests contra un PostgreSQL real, con
  aislamiento entre tests y comandos reproducibles.

### Modified Capabilities

Ninguna: no existen specs previos en `openspec/specs/`.

## Impact

- **Código nuevo:** estructura inicial de la app (`src/app`, `src/db`, configuración de Tailwind,
  shadcn/ui, Drizzle y testing). No se modifica código existente.
- **Dependencias nuevas:** `next`, `react`, `typescript`, `tailwindcss`, shadcn/ui y Radix,
  `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, y el framework de testing y su
  soporte de Postgres.
- **Documentación:** nuevo `adrs/0011-*.md` con el framework de testing; actualización de la
  línea `npm run test` de `CLAUDE.md` y de la fila de `TECH-DESIGN.md` que lista los ADRs.
- **Sistemas externos:** requiere una base Neon y la variable `DATABASE_URL`. Para los tests, un
  Postgres real local o efímero.
- **Restricción respetada:** despliegue compatible con Vercel Hobby y con Neon como única
  persistencia.
