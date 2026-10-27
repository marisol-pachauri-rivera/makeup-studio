# Design

## Context

El repositorio contiene solo documentación (`PRD.md`, `TECH-DESIGN.md`, `BACKLOG.md`, `adrs/`,
`CLAUDE.md`); no hay `package.json` ni código. Las decisiones ya están tomadas: monolito Next.js
(ADR 0001), Vercel Hobby + Neon + Drizzle sobre `@neondatabase/serverless` (ADR 0002), reintento
acotado y páginas de error propias (ADR 0009), Tailwind + shadcn/ui mobile-first (ADR 0010). La
única decisión nueva que exige el backlog es el framework de testing con Postgres real. Motivación
en `proposal.md`; requisitos en `specs/`.

## Goals / Non-Goals

**Goals:**
- Dejar un esqueleto que compila, lintea, testea y arranca, sobre el que los ítems #2 a #14 se
  apoyen sin rehacer configuración.
- Que la capa de datos sirva desde el principio para transacciones interactivas, porque el
  ADR 0009 exige que cada creación o modificación de reserva corra en una.
- Que los tests puedan probar restricciones propias de Postgres (la exclusión del ADR 0003 llega
  en el ítem #2) sin cambiar la infraestructura de pruebas.

**Non-Goals:**
- Ninguna tabla, migración de negocio, Server Action, Zod de negocio, autenticación ni pantalla
  de dominio. La página de inicio es un marcador mínimo.
- CI, despliegue a Vercel y provisión de la base Neon real (solo se documentan las variables).
- Monitoreo de errores (el ADR 0009 lo excluye).

## Decisions

### 1. Scaffold con `create-next-app` en el directorio actual, App Router, carpeta `src/`
Next.js + TypeScript estricto, ESLint y alias `@/*`. Se conservan los documentos existentes. Los
scripts `dev`, `build`, `start`, `lint` y `test` coinciden con los de `CLAUDE.md`.
*Alternativa:* estructura sin `src/`. Se descarta para separar el código de los documentos de la
raíz, que ya son numerosos.

### 2. Drivers: `neon-serverless` (Pool con WebSocket) en producción, no `neon-http`
El driver HTTP de Neon no soporta transacciones interactivas, que el ADR 0009 y el ítem #7 exigen.
Se usa el adaptador `drizzle-orm/neon-serverless` con `Pool`. En Node sin `WebSocket` global se
asigna el constructor de `ws`.
*Alternativa:* `neon-http`, más liviano en cold start. Se descarta porque obligaría a rehacer la
capa de datos al llegar al ítem #7.

### 3. Un solo módulo de acceso a datos, solo servidor
`src/db/` expone una instancia de Drizzle y los helpers de reintento. Se marca como solo servidor
para que no entre al bundle del cliente. Lee `DATABASE_URL` de forma perezosa y falla con un
mensaje claro si falta. Las migraciones van en `drizzle/` con `drizzle-kit` y scripts `db:generate`
y `db:migrate`. Con esquema vacío, `generate` no produce nada y `migrate` es un no-op.

### 4. Reintento acotado en la adquisición de conexión y en consultas sueltas, no dentro de una transacción abierta
La suspensión de Neon se manifiesta al abrir la conexión o en la primera consulta. Se reintenta en
esos dos puntos. Una transacción en curso no se reintenta a mitad: un fallo allí se propaga y
revierte, para no repetir efectos parciales.
- Parámetros en un único archivo de constantes: **4 intentos en total, espera de 300, 600 y
  1200 ms** (~2,1 s acumulados, dentro del tiempo de las funciones de Vercel Hobby). Es un valor
  inicial y se ajusta con evidencia real.
- Se reintenta solo ante errores de conexión: códigos de red de Node (`ECONNRESET`, `ECONNREFUSED`,
  `ETIMEDOUT`), clase SQLSTATE `08` y `57P01`/`57P03`. Todo lo demás (violaciones de restricción,
  sintaxis) se propaga sin reintentar.
- Al agotarse, se lanza un error propio de acceso a datos que conserva la causa original solo para
  el log del servidor.
*Alternativa:* un reintento genérico alrededor de cualquier consulta. Se descarta por el riesgo de
duplicar efectos y de ocultar errores de lógica.

### 5. Páginas de error con las convenciones del App Router
`error.tsx` (componente cliente con acción "reintentar"), `global-error.tsx` (con su propio
`<html>` y estilos autocontenidos, porque reemplaza al layout raíz) y `not-found.tsx`. Ninguna
renderiza `error.message` ni la traza; el detalle se registra en el servidor. Se construyen con los
componentes de shadcn/ui y el mismo tema, con diseño mobile-first.

### 6. Testing: Vitest + PostgreSQL real en contenedor, con driver `node-postgres` en las pruebas **(ADR 0011, propuesto)**
- **Vitest** como runner: soporte nativo de TypeScript y ESM, rápido y sin transpilación aparte.
- **PostgreSQL real** vía contenedor Docker de la misma versión mayor que Neon (el dato se
  confirma contra el proyecto Neon al escribir el ADR). Se levanta una vez por corrida desde el
  `globalSetup` de Vitest con Testcontainers, y se destruye al terminar. No hay que mantener
  una base a mano.
- **Driver distinto en pruebas:** el WebSocket de `@neondatabase/serverless` no habla con un
  Postgres plano. Los tests usan `drizzle-orm/node-postgres`, y el módulo de datos expone el tipo
  común de Drizzle para Postgres, de modo que el código de negocio no sabe qué driver hay detrás.
  El reintento se prueba con un cliente falso que falla N veces, sin suspender nada real.
- **Aislamiento:** una base nueva por corrida y limpieza entre tests dentro de ella (transacción
  revertida o truncado). El `globalSetup` aborta si la URL de pruebas coincide con `DATABASE_URL`.
- **Migraciones:** el `globalSetup` aplica las de `drizzle/` antes del primer test, tolerando el
  directorio vacío.
- Los tests unitarios sin base (reintento, páginas de error) corren en el mismo comando.

*Alternativa A, rama de Neon dedicada a tests:* usa el mismo driver y motor exactos, pero exige red
y cuenta, gasta horas de cómputo del free tier y puede llegar a suspenderse en plena corrida; es
más lenta y frágil como suite diaria. Queda abierta como prueba de humo opcional futura.
*Alternativa B, Postgres embebido o PGlite:* no necesita Docker, pero es un motor distinto del
real; el ítem #2 depende de `EXCLUDE` con `btree_gist` y no conviene validarlo contra un sustituto.
*Alternativa C, Jest:* más configuración para ESM y TypeScript, sin ventaja aquí.

### 7. Configuración y documentación
Se agrega `.env.example` con `DATABASE_URL` (y la URL de pruebas si hace falta), con `.env*.local`
fuera de Git. `CLAUDE.md` pasa de "framework de testing aún no definido" a Vitest, y
`TECH-DESIGN.md` suma la fila del ADR 0011 y retira el riesgo "Sin framework de testing definido".

## Risks / Trade-offs

- **Docker es requisito para la suite con base** (ADR 0011) → Si no está disponible, la suite
  falla con un mensaje claro en lugar de pasar en silencio; los tests sin base siguen corriendo con
  un modo que los selecciona por separado. Confirmar con el usuario antes de aplicar.
- **Driver distinto en pruebas y producción** → Ambos hablan el protocolo de Postgres y se accede
  por Drizzle; el riesgo está en el transporte. Se mitiga con la prueba de humo opcional contra una
  rama de Neon y manteniendo cualquier código específico del driver dentro de `src/db/`.
- **Reintento de ~2 s suma latencia visible tras inactividad** (ya aceptado en ADR 0009) →
  Parámetros centralizados para ajustarlos.
- **Reintentar un `commit` cuya confirmación se perdió** podría duplicar efectos → Por eso no se
  reintenta dentro de transacciones; la idempotencia del ítem #7 cubre el resto.
- **Versiones de Next, Tailwind y shadcn/ui cambian con rapidez** → Fijar versiones exactas en
  `package.json` y registrarlas en el ADR 0011 y en las tareas.
- **Vercel Hobby es de uso no comercial** (ya señalado en ADR 0002) → Sin cambios aquí; no se
  despliega en este ítem.
