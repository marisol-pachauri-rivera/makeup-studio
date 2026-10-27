# Design

## Context

Estado de partida (ítems #1 y #2 archivados): Next 16.4.3 con `cacheComponents`, Drizzle sobre `neon-serverless`, tabla `usuario_admin` (`usuario` único, `password_hash`), Vitest con Postgres real. No hay `proxy.ts`, ni `src/app/admin`, ni dependencias de autenticación ni de validación. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- Vercel Hobby: funciones serverless sin estado compartido y sin cron (ADR 0002/0004). Un contador de intentos en memoria no sirve; hay que persistirlo.
- ADR 0007 permite argon2 o bcrypt; ADR 0006 exige Zod y verificación de sesión en cada Server Action del panel.
- Next 16 renombró middleware a `proxy.ts`, y su documentación advierte que el proxy sirve para comprobaciones optimistas y no como autorización completa. Con `cacheComponents` la lectura de la sesión ocurre en tiempo de petición y va detrás de `<Suspense>`.
- Auth.js v5 (`next-auth@5`) solo existe como beta en npm (`5.0.0-beta.32`); la `4.x` estable no soporta bien el App Router de Next 16.
- `AGENTS.md` indica leer `node_modules/next/dist/docs/` antes de escribir código de Next.

## Goals / Non-Goals

**Goals:**
- Que el resto de ítems del panel (#4, #5, #11, #14) usen un único guardia `requerirAdmin()` y no reimplementen autenticación.
- Que dar de baja a una administradora corte su acceso de inmediato.
- Que el límite de intentos funcione sin Redis ni cron y sin revelar si un usuario existe.

**Non-Goals:**
- Roles, permisos por administradora, recuperación de contraseña, 2FA, límite por IP, auditoría de accesos.
- Las pantallas de gestión del panel.

## Decisions

### 1. Auth.js v5 con credenciales y sesión JWT
Se usa `next-auth@5` (fijado a una versión exacta, como el resto de `package.json`) con el proveedor `Credentials` y estrategia de sesión `jwt` en cookie. Con Credentials Auth.js no admite sesiones de base de datos, así que JWT es el camino soportado. La vigencia máxima es de 8 horas (`session.maxAge`), sin renovación por actividad (`updateAge` alto).
- *Alternativa:* sesión propia con `iron-session` (la que usa la guía de Next). Menos dependencias, pero ADR 0007 ya eligió Auth.js y descartó la sesión hecha a mano.
- *Riesgo asumido:* versión beta → ver Riesgos.

### 2. Hash con `bcryptjs`, costo 12
`bcryptjs` es JavaScript puro: no necesita binarios nativos ni ajustes de empaquetado en Vercel. `argon2` es más moderno pero exige binarios por plataforma y complica el despliegue de un monolito de una persona. Se fija el costo en una constante y se prueba el tiempo de una verificación.
- *Alternativa:* `argon2` nativo. Rechazada por fricción de despliegue; ADR 0007 admite ambos, no hace falta ADR nuevo por esto.
- Se verifica siempre contra un hash: si el usuario no existe se compara contra un hash señuelo del mismo costo, para que el tiempo de respuesta no delate usuarios inexistentes.

### 3. Límite de intentos en una tabla `intento_login` (ADR 0012)
Tabla con `id`, `usuario` (normalizado: `trim` + minúsculas), `intentado_en` (`timestamptz` por defecto `now()`), con índice `(usuario, intentado_en)`. Solo se guardan fallos.
- Antes de verificar la contraseña: `count(*)` de fallos del usuario en los últimos 15 min; si es `>= 5` se rechaza sin verificar ni registrar.
- Tras un fallo: `insert`. Tras un éxito: `delete` de los fallos de ese usuario.
- Limpieza lazy, sin cron: en cada intento se borran los fallos de ese usuario más viejos que la ventana.
- Condición de carrera: dos intentos simultáneos pueden pasar ambos el chequeo y dejar 6 fallos; se acepta, el exceso es de 1 o 2 intentos y no justifica un bloqueo de fila. Se documenta.
- *Alternativas:* contador en columnas de `usuario_admin` (no cubre usuarios inexistentes, lo que permitiría enumerarlos, y mezcla estado transitorio con la identidad); límite por IP (en Vercel exige leer `x-forwarded-for`, fácil de falsear y de sesgar con IP compartidas); Upstash/Redis (servicio externo que ADR 0002 no contempla).
- *Trade-off:* el límite por usuario permite que alguien bloquee la cuenta de una administradora a propósito durante 15 minutos. Se acepta porque son pocas cuentas, el bloqueo es corto y el panel no es de uso crítico en tiempo real.
- Como agrega una entidad al modelo de ADR 0005 se registra en un ADR 0012 corto, antes de implementar.

### 4. Guardia de sesión único: `requerirAdmin()`
Función en `src/lib/auth/` marcada `server-only` que llama a `auth()` y además confirma que el `id` de la sesión sigue existiendo en `usuario_admin` (una consulta por indexado de clave primaria). Si falta, lanza un error de no autorizada (en acciones) o redirige al login (en páginas), con dos variantes pequeñas sobre la misma lógica. El JWT por sí solo no se entera de una baja; la consulta lo resuelve y es barata frente al volumen del panel.
- Toda Server Action del panel llama a `requerirAdmin()` en su primera línea, antes de validar con Zod (ADR 0006). Se agrega una prueba que recorre los archivos de acciones del panel y falla si alguna exportación no lo invoca, para que olvidarlo no sea silencioso (ADR 0006 lo señala como la brecha principal). La prueba revisa los `actions.ts` bajo `src/app/admin/`, exceptuando `src/app/admin/login/`: la acción de login es la única pública porque es la que crea la sesión. Hoy la única acción protegida es `cerrarSesion`; el resto llega desde el ítem #4.
- *Alternativa:* envolver acciones con un HOF `accionAdmin(schema, fn)`. Más seguro por construcción, pero impone una forma a ítems que aún no existen; se deja como posible refactor.

### 5. `proxy.ts` solo como comprobación optimista
`src/proxy.ts` con `matcher: ['/admin/:path*']` lee la cookie de sesión de forma barata (sin consultar la base) y redirige a `/admin/login` si falta, preservando un `callbackUrl` solo cuando empieza con `/admin`. No es la barrera real: cada página usa `requerirAdmin()` y cada acción también.
- *Alternativa:* no usar proxy. Sería válido, pero redirigir antes de renderizar evita cargar el panel para visitantes sin sesión.

Confirmado contra la documentación de Next 16.4 (tarea 1.2): `proxy.ts` (export `proxy`, runtime Node.js por defecto, `matcher` constante) es la convención vigente; la guía de autenticación manda que el proxy solo lea la cookie, sin consultar la base, porque corre también en rutas prefetcheadas. Matices a respetar: las Server Actions son POST a la ruta donde se usan, así que un `matcher` que no cubra esa ruta las deja sin proxy; por eso cada acción verifica sesión por sí misma. Además, Auth.js nombra la cookie `authjs.session-token` (HTTP) o `__Secure-authjs.session-token` (HTTPS): el proxy debe aceptar ambas. `redirect()` lanza una excepción y debe llamarse fuera de `try/catch`.

### 6. Estructura de rutas y UI
`/admin/login` fuera del layout protegido; el resto en un grupo de rutas `(panel)` con layout que llama a `requerirAdmin()` y muestra cabecera con "Cerrar sesión". Formulario de login con Server Action (`useActionState`), validado con Zod, componentes shadcn existentes (`button`; se agregan `input` y `label` con el CLI de shadcn). Los textos van en español. Los encabezados `Cache-Control: private, no-store` y `X-Robots-Tag: noindex` se fijan en `next.config.ts` para `/admin/:path*`.
- Con `cacheComponents`, la lectura de sesión va dentro de `<Suspense>`; el layout del panel no puede prerenderse y se verifica con `npm run build`.

### 7. Seed de administradora
`scripts/seed-admin.ts` (se ejecuta con `tsx`, ya instalado), expuesto como `npm run db:seed-admin`. Lee `ADMIN_USUARIO` y `ADMIN_PASSWORD` del entorno (con `dotenv`, como el resto de scripts), valida con Zod (contraseña de 12+ caracteres), hashea e inserta con `insert … on conflict do nothing` y informa si el usuario ya existía sin tocarlo. Nunca imprime la contraseña. Las credenciales no van en Git: `.env.local` ya queda fuera del control de versiones; se añade `.env.example` con nombres sin valores.

### 8. Configuración y secretos
`AUTH_SECRET` es obligatorio; si falta, el arranque falla con un mensaje claro en vez de generar sesiones inseguras. `AUTH_TRUST_HOST` se deja a cargo de Vercel. En tests se inyecta un secreto fijo.

## Risks / Trade-offs

- **Auth.js v5 es beta** → fijar versión exacta, encapsular todo el uso de `next-auth` en `auth.ts` y `src/lib/auth/` para poder reemplazarlo; correr `npm run build` y las pruebas de integración antes de cada actualización. Si la beta resulta inviable con Next 16.4, la salida es `iron-session` con el mismo guardia (cambiaría ADR 0007, se consultaría).
- **Bloqueo intencional de una cuenta por un tercero** → ventana corta de 15 min y pocas cuentas; límite por IP queda fuera de alcance.
- **Recuperación de contraseña manual** → el seed puede re-ejecutarse tras borrar la fila, documentado en README (ADR 0007 ya lo acepta).
- **Carrera en el conteo de intentos** → se tolera un exceso de 1–2 intentos.
- **Olvidar el guardia en una acción futura** → prueba automática de convención + criterio explícito en las specs de #4, #5 y #11.
- **Una consulta extra por petición** (`requerirAdmin()` consulta la base) → índice por clave primaria; con la suspensión de Neon se beneficia del reintento acotado de #1.
- **Neon sin migrar todavía** → la migración `0003` se prueba con Postgres real en contenedor; aplicarla a Neon sigue pendiente junto con `0000–0002`.

## Migration Plan

1. Generar `0003_intento_login` con `npm run db:generate` (solo agrega una tabla y un índice; no hay restricciones manuales que repetir). Verificar que un segundo `db:generate` responda "No schema changes".
2. Aplicar con `npm run db:migrate` a la base de desarrollo y a Neon junto con las anteriores.
3. Definir `AUTH_SECRET` en Vercel y local; correr `npm run db:seed-admin` una vez por administradora.
4. Rollback: las migraciones solo avanzan (CLAUDE.md); el rollback es revertir el despliegue de código y dejar la tabla vacía sin uso, que es inocua.

## Open Questions

- ¿Cuántas administradoras habrá al inicio y con qué usuarios? Solo afecta al seed, no al diseño.
