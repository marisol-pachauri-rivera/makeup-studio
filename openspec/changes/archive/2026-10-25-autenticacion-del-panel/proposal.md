# Proposal

## Why

El panel administrativo expondrá datos de clientas y acciones sensibles (validar pagos, cancelar reservas, gestionar agenda), pero hoy no existe ninguna forma de identificar a quien lo usa. Los ítems #4, #5, #11 y #14 del backlog construyen pantallas y Server Actions del panel; todos dependen de que la autenticación y la verificación de sesión ya estén resueltas (ADR 0006 y ADR 0007).

## What Changes

- Inicio de sesión del panel con Auth.js (proveedor de credenciales, usuario y contraseña) contra la tabla `usuario_admin` existente, con sesión en cookie.
- Contraseñas verificadas contra un hash (`password_hash`); sin registro público.
- Límite de intentos fallidos de inicio de sesión, persistido en Postgres (no hay Redis, cron ni estado en memoria fiable en Vercel). Requiere una tabla nueva y una migración.
- Protección de las rutas `/admin/**`: sin sesión se redirige al login. El `proxy.ts` de Next 16 hace solo una comprobación optimista; la verificación real ocurre en el servidor.
- Un guardia de sesión reutilizable que toda Server Action del panel debe invocar antes de tocar datos (ADR 0006), de modo que falle aunque se invoque directamente sin sesión.
- Pantalla de login, cierre de sesión y una página mínima del panel (`/admin`) que sirva de destino y de ejemplo de uso del guardia.
- Alta de administradoras por script de seed (`npm run db:seed-admin`), con credenciales por entorno o argumentos, nunca en Git.
- ADR nuevo (0012) para el almacenamiento del límite de intentos, porque agrega una entidad al modelo de ADR 0005.

Fuera de alcance: recuperación de contraseña, registro o baja de usuarios desde la interfaz, roles o permisos distintos entre administradoras, autenticación de las clientas (ADR 0004), las pantallas de gestión del panel (#4, #5, #11, #14).

## Capabilities

### New Capabilities
- `admin-authentication`: inicio y cierre de sesión de administradoras con usuario y contraseña, límite de intentos fallidos, alta de administradora por seed y mensajes de error que no revelan si el usuario existe.
- `admin-access-control`: protección de las rutas del panel y verificación obligatoria de sesión en cada Server Action del panel.

### Modified Capabilities
- `studio-reference-data`: se agrega el registro de intentos de inicio de sesión como dato de referencia de seguridad del panel (nueva tabla junto a `usuario_admin`).

## Impact

- Código nuevo: `auth.ts` (configuración de Auth.js), `src/proxy.ts`, `src/app/admin/**` (login y panel mínimo), guardia de sesión en `src/lib/auth/`, script `scripts/seed-admin.ts`.
- Base de datos: tabla nueva `intento_login` y migración generada con Drizzle (`0003_*`); `src/db/schema.ts`.
- Dependencias nuevas: `next-auth` (v5, solo existe como beta), `bcryptjs` (hash en JavaScript puro, sin binarios nativos que compliquen Vercel), `zod` (ADR 0006).
- Variables de entorno: `AUTH_SECRET` y, para el seed, credenciales de la primera administradora.
- Documentación: ADR 0012, actualización de `TECH-DESIGN.md` (tabla de ADRs y modelo) y de `README.md` (variables y seed).
- Pruebas: nuevas pruebas unitarias y de integración con Postgres real (ADR 0011).
