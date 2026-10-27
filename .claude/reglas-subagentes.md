# Reglas comunes de los subagentes de OpenSpec

Las leen todos los agentes de `.claude/agents/` antes de empezar. Si algo de aquí choca con el `CLAUDE.md` del
proyecto, manda el `CLAUDE.md`.

## Alcance de esta fase: solo planificar

- Tu trabajo es redactar la **propuesta OpenSpec** de un ítem del backlog (proposal, specs, design y tasks) con la
  skill `opsx:propose` (herramienta Skill, `skill: "opsx:propose"`), hasta que `openspec validate <change> --strict`
  pase.
- **No** edites código: nada en `src/`, `tests/`, `drizzle/`, `README.md`, `next.config.ts`, `.env.example` ni
  `adrs/`. **No** apliques el change. **No** toques `openspec/specs/` ni el archivo (`openspec/changes/archive/`).
- Escribe **solo** dentro de `openspec/changes/<tu-change>/`. Otros tres agentes redactan sus propios changes a la vez:
  no leas ni modifiques los de ellos.
- No ejecutes `npm run build`, `npm run test`, `npm run dev` ni `npm run start`: comparten disco, puertos y la base
  de pruebas con los demás. Sí puedes ejecutar `openspec ...` y leer cualquier archivo.
- Si una decisión contradice un ADR, no la tomes: déjala como pregunta abierta (regla del proyecto). Si el PRD tiene
  un `<!-- REVISAR -->` relevante, señálalo en el informe.
- El proyecto **no es un repositorio git** y está en Windows (Git Bash disponible). Responde y escribe en español.

## Lectura obligatoria antes de planificar

1. `PRD.md` completo, `TECH-DESIGN.md` completo (sus criterios de aceptación son la fuente del comportamiento), y la
   fila de tu ítem en `BACKLOG.md`.
2. Los ADR de la columna "ADRs relacionados" de tu ítem, en `adrs/`.
3. Los `design.md` y las specs de los changes ya archivados que tu ítem toca, en `openspec/changes/archive/`
   (sobre todo `2026-10-26-reserva-individual`, `2026-10-26-vencimiento-lazy-de-reservas`,
   `2026-10-26-pago-por-qr-y-numero-de-operacion`, `2026-10-26-reserva-grupal` y `2026-10-24-autenticacion-del-panel`),
   y las specs vigentes en `openspec/specs/`.
4. El código real que vas a tocar o reutilizar (revísalo con herramientas de solo lectura).

## Lo que ya existe y no se re-discute

- Monolito Next 16 con `cacheComponents` (lo que lee `params`, `searchParams`, la sesión o la base va detrás de
  `<Suspense>`; el reloj `new Date()` solo se lee después de una API de petición). Drizzle con `neon-serverless`
  (`Pool`) en producción y `node-postgres` en las pruebas (ADR 0011: Vitest con Postgres real en contenedor).
- Un cliente de transacción de `pg` **no admite consultas en paralelo** (deprecado): dentro de una transacción todo
  va en serie; las lecturas de revalidación van fuera de la transacción.
- Panel `/admin`: toda Server Action bajo `src/app/admin/` empieza con `await requerirAdmin()` (lo comprueba
  `tests/auth/acciones-del-panel.test.ts`); las páginas leen la sesión con `requerirAdminOLogin()` dentro de
  `<Suspense>`. Patrón de sección del panel: capa de datos con la base inyectada en `src/lib/<modulo>/`, funciones
  de formulario puras (`procesar*`), acciones delgadas, `useActionState` para errores por campo.
- Reservas: `reserva` (estado `pendiente_pago` → `pendiente_validacion` → `confirmada`, y `cancelada`; número de
  operación único; `motivo_rechazo`; `motivo_cancelacion` en `vencida|clienta|studio`; `estado_reembolso` en
  `no_aplica|pendiente|realizado`) y `reserva_linea` (una por persona, `activa`, exclusión por maquilladora y rango
  semiabierto en Postgres). Los CHECK exigen: `pendiente_pago` sin número, `pendiente_validacion` y `confirmada` con
  número, `cancelada` con motivo (y solo ella). `activa` de las líneas se sincroniza en la misma transacción.
- Funciones reutilizables: `condicionVencida` y `insertarLineaLiberandoVencidas` (`src/lib/reserva/vencimiento.ts`),
  `consultarDisponibilidad` y `calcularHuecos` (`src/lib/disponibilidad/`), `ZONA_STUDIO` y sus conversiones
  (`src/lib/agenda/zona-horaria.ts`), `obtenerReservaPorToken` (`src/lib/reserva/estado.ts`), `leerErrorPg`,
  `esChoqueDeHorario` (`src/lib/reserva/errores-pg.ts`).
- Las transiciones de estado se hacen con **un `UPDATE` condicionado al estado esperado** (así una carrera con otra
  operación gana exactamente una y el estado queda coherente). `23P01` y `40P01` significan "horario ya no disponible".
- Las pruebas de integración que cuentan filas globales deben limpiar con `beforeEach` (no solo `afterEach`); el
  `cerrar()` de `crearDbDePrueba()` vacía las tablas al terminar el archivo.

## Cómo debe quedar la propuesta

- Specs de comportamiento observable, con requisitos de menos de 500 caracteres cada uno, cada uno con escenarios
  (`#### Scenario:`). Las capacidades nuevas **traen su `## Purpose`** antes de `## ADDED Requirements`. Un
  requisito `MODIFIED` copia el bloque completo con todos sus escenarios.
- Tareas pequeñas y verificables, cada una con la forma de comprobarla; incluye pruebas de integración con Postgres
  real para todo lo que cambie estado, y pruebas de la carrera que corresponda.
- Declara en el `design.md` los supuestos que hiciste y las preguntas abiertas (no los des por resueltos en silencio).

## Qué devolver al terminar (informe de máximo ~40 líneas)

1. Ruta del change y resultado de `openspec validate <change> --strict`.
2. Capacidades nuevas y modificadas (nombres).
3. **Lista exacta de archivos del repositorio que la implementación tocaría o crearía**, separando "nuevos" de
   "existentes que se modifican". Es lo más importante: con las cuatro listas se detectan choques entre agentes.
4. Si necesitas una migración y por qué.
5. Supuestos, preguntas abiertas y cualquier `REVISAR` del PRD que afecte tu ítem.
6. Dependencias con los otros tres ítems (#11, #12, #13, #14): qué necesitas que exista antes y qué dejas listo.
