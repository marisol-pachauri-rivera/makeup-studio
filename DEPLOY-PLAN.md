# Deploy Plan — makeup-studio

Fecha: 2026-10-26
Estado: EJECUTADO PARCIAL (primer deploy hecho; smoke test corregido y pendiente de verse en verde)

## Resumen del proyecto

- **Stack:** monolito Next.js 16 + TypeScript, npm, Drizzle ORM sobre Neon (driver serverless por WebSocket), Auth.js. Hoy se despliega en Vercel (`.vercel/project.json` enlazado al proyecto `makeup-studio`).
- **Tests existentes:** Vitest (`unit` sin Docker; `integration` con Postgres real vía Testcontainers, ADR 0011) y Playwright (`tests-play/`: crear maquilladora en el panel, reserva individual, reserva grupal; más `example.spec.ts`, que apunta a playwright.dev y no es del proyecto).
- **Playwright hoy:** `npm run dev` como `webServer`, escribe en el branch `dev` de Neon (`DATABASE_URL` de `.env.local`) y depende de datos demo ("Demo Ana", "Demo Maquillaje social", "Demo Peinado", "Demo Bea") y de `E2E_ADMIN_USUARIO/PASSWORD`.
- **CI/CD existente:** ninguno (no hay `.github/`). Repo en GitHub (`origin`), una sola rama (`main`), 7 commits, un solo desarrollador.
- **Sin confirmar:** si Vercel despliega solo desde GitHub (la usuaria no está segura). Es el primer paso de EXECUTE.
- **No hay** health endpoint (ADR 0006: sin endpoints REST propios), ni cron, ni storage, ni mensajería saliente.
- **No es un paquete publicado:** es un servicio que el proyecto corre en sí mismo.

## Sistema de deployment propuesto

### Build
`npm ci` + `npm run build` (`next build`) en el runner de GitHub Actions, con Node 22 (alineado con `@types/node` 22) y `package-lock.json` como fuente de versiones. `getDb()` es perezoso, así que el build no necesita base de datos; sí un `AUTH_SECRET` ficticio si Auth.js lo exige al compilar (se comprueba al generar). Vercel vuelve a construir en su lado al recibir el deploy: el build de CI es un *gate*, no el artifact.

### Artifact
El build de Vercel que dispara el Deploy Hook, para el commit exacto de `main` que pasó el pipeline. Trazabilidad: cada deployment de Vercel lleva el SHA del commit; el log de GitHub Actions enlaza SHA ↔ run ↔ deployment.

### Config & Secrets
| Dato | Tipo | Dónde vive |
|---|---|---|
| `NEON_API_KEY` | secreto | GitHub secret del repo (crear/borrar branches efímeros) |
| `DATABASE_URL` de producción | secreto | GitHub secret del *environment* `production` (solo para migrar) y variables de Vercel (runtime) |
| `VERCEL_DEPLOY_HOOK_URL` | secreto | GitHub secret del *environment* `production` |
| `AUTH_SECRET` en CI | secreto efímero | generado por corrida (`openssl rand`), enmascarado; nunca el de producción |
| Credenciales E2E del panel | secreto efímero | usuaria `e2e-ci` con contraseña aleatoria por corrida, creada en el branch efímero; nunca la administradora real |
| `NEON_PROJECT_ID`, id del branch `dev`, `PRODUCTION_URL` | config (no secreto) | GitHub variables |

Nada va al repo ni a los logs. Los secretos del *environment* `production` solo los ven los jobs que lo declaran, y ese job exige aprobación manual.

### Infraestructura
Sin cambios: Vercel (free tier) + Neon (única persistencia), según ADR 0002. GitHub Actions como orquestador (gratis para este uso). No se añade ninguna infraestructura nueva.

### Entornos
- **CI/E2E:** branch efímero de Neon creado desde `dev` (hereda esquema y datos demo), con TTL de 7 días como red de seguridad (`neon.ts`) y borrado explícito al terminar. Cada corrida está aislada de tu máquina y de las demás.
- **Local:** sin cambios (`.env.local`, branch `dev`).
- **Producción:** Vercel production + branch por defecto de Neon. Previews de Vercel en ramas/PR: se dejan como están.

> Supuesto a verificar: que el branch `dev` tenga los datos demo y horarios necesarios para los tres E2E, y que no sea el branch de producción. Si no, el job de E2E fallará en la primera corrida y se corrige el origen del branch (no el test).

### Estrategia de release
**Direct release** (todo el tráfico al nuevo deployment). Justificación: un studio, un solo desarrollador, baja tolerancia a complejidad, y Vercel permite volver al deployment anterior al instante. Canary/blue-green no aportan aquí lo que cuestan.

### Data & Migrations
- Las migraciones de Drizzle (`drizzle/`, incluido SQL escrito a mano como la exclusión de `reserva_linea`) se aplican **antes** del deploy de código, en un job protegido por aprobación manual.
- **Regla de compatibilidad:** el código N-1 debe seguir funcionando con el esquema N (migraciones aditivas: expand → contract en dos releases). Esto es lo que hace seguro el rollback de código.
- **Un rollback de código NO revierte datos.** Las migraciones solo avanzan (CLAUDE.md). Si una migración sale mal, la vía es restaurar/ramificar desde el historial de Neon (ver Recovery), decidida por la usuaria.
- En CI las migraciones corren sobre el branch efímero, así que una migración rota se detecta antes de tocar producción.

### Deploy gates
Pipeline `.github/workflows/ci.yml` (en `pull_request` y `push` a `main`):

1. **verificar:** `npm ci` → `npm run lint` → `npm run test` (Vitest completo; los runners de Ubuntu traen Docker para Testcontainers) → `npm audit --omit=dev --audit-level=high` → `npm run build`.
2. **e2e** (necesita `verificar`): crea branch efímero de Neon desde `dev` → `db:migrate` → crea la admin `e2e-ci` → instala Chromium → corre Playwright contra `next build && next start` (más parecido a producción que `next dev`) → sube `playwright-report/` y trazas como artifact si falla → **borra el branch siempre** (`if: always()`).
3. **desplegar** (solo `push` a `main`, necesita `verificar` + `e2e`, *environment* `production` con aprobación manual): migra producción → dispara el Deploy Hook → smoke test (ver abajo).

**Gate real, no informativo:** se desactiva el auto-deploy de `main` en Vercel (`git.deploymentEnabled: { "main": false }` en `vercel.json`, o "Ignored Build Step" en Settings → Git) y el único camino a producción es el Deploy Hook que dispara el job `desplegar` tras CI verde. Rojo = no hay deploy.

Cambios de repo que implica (se generan en GENERATE, tras tu aprobación del plan):
- `.github/workflows/ci.yml` nuevo, con `permissions: contents: read`, `concurrency` (sin deploys simultáneos), acciones fijadas por SHA, sin `pull_request_target`.
- `playwright.config.ts`: en CI, `webServer` = build + start con `AUTH_TRUST_HOST=true`; el resto igual (ya tiene `retries: 2`, `workers: 1`, `forbidOnly` para CI).
- `tests-play/example.spec.ts`: eliminarlo o excluirlo (depende de internet y de playwright.dev; sería una causa de falsos rojos).
- `vercel.json` nuevo con la desactivación del auto-deploy de `main`.
- `package.json`: scripts `test:e2e` y `db:seed-e2e` (o reutilizar `db:seed-admin` con otro usuario, sin script nuevo).

Ajustes manuales tuyos (no los hace el skill): en GitHub, *branch protection* de `main` exigiendo `verificar` y `e2e`, y crear el *environment* `production` con revisora requerida.

**Limitaciones a verificar antes de confiar en el gate:**
1. El Deploy Hook de Vercel requiere que el proyecto esté conectado a un repo de Git. Si hoy se despliega solo por CLI, la alternativa es `vercel deploy --prebuilt --prod` desde CI con un `VERCEL_TOKEN`.
2. No he confirmado que `deploymentEnabled: false` no bloquee también al Deploy Hook. Se comprueba en EXECUTE con un deploy de prueba; si bloqueara, se usa "Ignored Build Step" o la vía CLI.
3. Si el repo fuera público, los PR de forks no reciben secretos: el job `e2e` se saltaría para ellos y el merge sería decisión tuya.

### Verify & Observe
**Smoke test post-deploy** (sin endpoint de salud, ADR 0006; usa páginas existentes), con reintentos hasta que el deployment nuevo responda:
- `GET {PRODUCTION_URL}/` → 200 y contiene el catálogo.
- `GET {PRODUCTION_URL}/admin` → redirige al login (comprueba Auth.js y su `AUTH_SECRET`).
- Cabecera de `/reservar` o `/reservas/x` con `Cache-Control: private, no-store` (ADR 0004).
Sin crear reservas ni escribir en producción. Si falla, el job queda rojo y se avisa; **no hay rollback automático**.

**Observar:** Vercel Runtime Logs y Neon (consumo/errores). No hay herramienta de observabilidad adicional hoy; añadir alertas queda fuera de este plan.

### Recovery
- **Código:** Vercel → Deployments → *Instant Rollback* / promover el deployment anterior. Lo ejecuta la usuaria o, con su autorización explícita en ese momento, el skill.
- **Datos:** Neon permite restaurar a un punto anterior o ramificar desde el historial (ventana limitada en free tier; confirmar su duración antes del primer despliegue con migraciones). La restauración la decide y autoriza la usuaria.
- **Pipeline roto / branch efímero huérfano:** `neon.ts` ya fija `ttl: 7d` para branches no por defecto, y el limite de branches del free tier se vigila.
- **Secreto filtrado:** rotar `NEON_API_KEY` / Deploy Hook / `DATABASE_URL` (acción tuya o autorizada al momento).

## Autorizaciones pendientes

Nada está autorizado todavía. Cada una se pide por separado en su momento:

1. Aprobar este plan (checkpoint antes de GENERATE).
2. Revisar Vercel → Settings → Git para saber si hay auto-deploy (lectura; lo haces tú o me dices el resultado).
3. Crear secretos/variables en GitHub y el *environment* `production` (tuyo, en la UI o con `gh` autorizado).
4. Crear el Deploy Hook en Vercel (cambia infraestructura).
5. Activar la desactivación del auto-deploy de `main` (cambia cómo se despliega producción).
6. Primera corrida del workflow en una rama/PR (crea y borra un branch de Neon).
7. Primera ejecución del job `desplegar` con migración y deploy reales a producción.
8. Cualquier rollback o restauración de datos.

## Registro de ejecución y verificación

### GENERATE (2026-10-26)
Creados/modificados, sin ejecutar nada: `.github/workflows/ci.yml` (acciones fijadas por SHA), `vercel.json` (auto-deploy de `main` desactivado), `playwright.config.ts` (en CI: build + start), `package.json` (script `test:e2e`), y eliminado `tests-play/example.spec.ts`.
Decisiones de implementación: el smoke test espera 120 s y luego sondea (no puede distinguir el deployment nuevo del anterior sin un token de Vercel; es una limitación conocida). Los inputs/outputs de las acciones de Neon (`parent_branch`, `db_url`, `db_url_pooled`, `branch_id`) se confirman en la primera corrida.
Variables/secretos que el workflow espera: secret `NEON_API_KEY`; vars `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH` (el branch `dev`), `PRODUCTION_URL`; en el environment `production`: secrets `DATABASE_URL`, `VERCEL_DEPLOY_HOOK_URL`.

### EXECUTE y VERIFY (2026-10-27)
Cada acción la autorizó la usuaria por separado.

- **Configuración (hecha por la usuaria):** secret `NEON_API_KEY`, variables `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH` (`dev`, no producción: el branch de producción tiene datos reales de clientas y no tiene los datos demo de los E2E) y `PRODUCTION_URL`; environment `production` con revisora requerida y secrets `DATABASE_URL` y `VERCEL_DEPLOY_HOOK_URL`. Una revisión previa al merge detectó que el environment no tenía revisora (el job habría desplegado sin aprobación); se corrigió antes de mergear.
- **PR #1, primera corrida:** `verificar` OK; `e2e` falló por falta de configuración (esperado). Tras configurar, el reintento de `e2e` pasó: 3 tests Playwright OK (~26 s), migraciones aplicadas al branch efímero y branch borrado. Los nombres de inputs/outputs de las acciones de Neon eran correctos.
- **Merge a `main` (squash, `d25d2ff`) y primer deploy (run 40455084103):** `verificar` y `e2e` OK; `desplegar` esperó aprobación y fue aprobado por la usuaria. Migración de producción y Deploy Hook: OK. **Smoke test: FALLÓ** (20 intentos con 308).
- **Causa del fallo:** `PRODUCTION_URL` estaba guardada con barra final; el script pedía `…app//` y Vercel respondía 308. No era un fallo del deploy. Comprobación manual posterior: `/` 200, `/admin` redirige a `/admin/login`, `/reservar` con `Cache-Control: private, no-store`.
- **Corrección:** la usuaria quitó la barra de la variable y el script ahora la normaliza (`${PRODUCTION_URL%/}`). El smoke test corregido aún no se ha ejecutado: se verá en el próximo deploy.
- **Resuelto:** el Deploy Hook funcionó con `deploymentEnabled: false` en `vercel.json` (el riesgo que estaba abierto).
- **Sin verificar aún:** que el deployment de producción de Vercel corresponda al SHA `d25d2ff` (el smoke test no lo puede probar sin token de Vercel) y que Vercel no haya hecho un deploy duplicado por auto-deploy.
- **Pendiente:** branch protection de `main` exigiendo `verificar` y `e2e` (acción manual de la usuaria).

Lección para el próximo Deploy Pass: validar el formato de las variables que el pipeline usa para construir URLs, y revisar las protecciones del environment antes del primer merge.
