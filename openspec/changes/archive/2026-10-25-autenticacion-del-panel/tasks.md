# Tasks

## 1. Decisión y dependencias

- [x] 1.1 Escribir `adrs/0012-limite-de-intentos-de-login.md` (formato de los ADR existentes) con la decisión de persistir fallos en Postgres y sus alternativas; actualizar la tabla de ADRs y el modelo de datos de `TECH-DESIGN.md`. Verificar que el ADR enlaza a 0005 y 0007 y que la tabla lo lista.
- [x] 1.2 Leer `node_modules/next/dist/docs/01-app/02-guides/authentication.md` y `03-api-reference/03-file-conventions/proxy.md` y confirmar la API vigente de `proxy.ts` y de `redirect`/`forbidden` en Next 16.4. Verificar que cualquier diferencia con el diseño queda anotada en `design.md`.
- [x] 1.3 Instalar con versión exacta `next-auth@5.0.0-beta.32` (confirmar con `npm view next-auth dist-tags` que sigue siendo la beta vigente), `bcryptjs` y `zod`; agregar con el CLI de shadcn los componentes `input` y `label`. Verificar con `npm install` sin errores ERESOLVE, y `npm run build` y `npm run test:unit` en verde.

## 2. Datos: intentos de login

- [x] 2.1 Agregar `intentoLogin` a `src/db/schema.ts` (`id` identity, `usuario` text, `intentadoEn` timestamptz default now, índice `(usuario, intentado_en)`) y generar la migración con `npm run db:generate`. Verificar que el SQL generado tiene los literales correctos (revisarlo a mano; no usar `node -e` con comillas simples) y que un segundo `db:generate` responde "No schema changes".
- [x] 2.2 Prueba de integración `tests/modelo/intento-login.int.test.ts` con Postgres real: inserta fallo sin administradora asociada, cuenta por usuario y ventana usando el índice, no existe columna de contraseña. Verificar con `npm run test`.

## 3. Núcleo de autenticación

- [x] 3.1 Implementar `src/lib/auth/password.ts` (hash y verificación con `bcryptjs`, costo 12, hash señuelo para usuario inexistente) con pruebas unitarias: verifica correcta e incorrecta, hash distinto por llamada, el tiempo de verificación con usuario inexistente es del mismo orden. Verificar con `npm run test:unit`.
- [x] 3.2 Implementar `src/lib/auth/limite-intentos.ts` (normalizar usuario, contar fallos de 15 min, registrar fallo, borrar al éxito, limpieza lazy) inyectando la base para probarlo. Pruebas de integración: 5 fallos bloquean incluso con contraseña correcta, usuario inexistente también bloquea, el bloqueo no suma fallos, pasa la ventana (controlando el reloj con instantes explícitos), un éxito reinicia. Verificar con `npm run test`.
- [x] 3.3 Implementar `auth.ts` (Auth.js, `Credentials`, sesión `jwt`, 8 h, cookie `HttpOnly`/`SameSite=Lax`/`Secure` en producción, `AUTH_SECRET` obligatorio con error claro) con Zod para la entrada, mismo mensaje para usuario inexistente y contraseña incorrecta, y el límite aplicado antes de verificar. Pruebas de integración de la función `authorize`: éxito, usuario con otras mayúsculas, contraseña incorrecta, usuario inexistente, campos vacíos, bloqueo. Verificar con `npm run test`.

## 4. Guardia de sesión y rutas

- [x] 4.1 Implementar `requerirAdmin()` en `src/lib/auth/` (`server-only`; lee `auth()` y confirma que el id existe en `usuario_admin`; variante que lanza error de no autorizada para acciones y variante que redirige al login para páginas). Pruebas de integración: sin sesión, con sesión válida, con administradora borrada. Verificar con `npm run test`.
- [x] 4.2 Prueba de convención `tests/auth/acciones-del-panel.test.ts` que recorre `src/app/admin/**/actions.ts` y falla si una Server Action exportada no llama a `requerirAdmin()`; verificar que pasa en vacío y que falla contra un archivo de acciones de prueba sin el guardia.
- [x] 4.3 Crear `src/proxy.ts` con `matcher` sobre `/admin/:path*` que redirige a `/admin/login` sin cookie de sesión, conservando `callbackUrl` solo si empieza con `/admin` (nunca URL externa). Pruebas unitarias del cálculo del destino: ruta del panel, URL externa, ruta ajena a `/admin`. Verificar con `npm run test:unit`.
- [x] 4.4 Fijar en `next.config.ts` los encabezados `Cache-Control: private, no-store` y `X-Robots-Tag: noindex` para `/admin/:path*`. Verificar con `npm run build && npm run start` y `curl -I` a `/admin/login`.

## 5. Interfaz

- [x] 5.1 Crear `/admin/login` (Server Action con `useActionState`, mensajes en español, textos de bloqueo con tiempo de espera, redirige a `/admin` si ya hay sesión). Pruebas de componente con Testing Library: campos vacíos, error de credenciales, mensaje de bloqueo. Verificar con `npm run test:unit`.
- [ ] 5.2 Crear el layout protegido `src/app/admin/(panel)/layout.tsx` (con `requerirAdmin()` dentro de `<Suspense>` por `cacheComponents`, cabecera y botón "Cerrar sesión") y la página mínima `/admin`. Verificar que `npm run build` pasa sin errores de prerender y que cerrar sesión devuelve al login.
- [ ] 5.3 Verificación de punta a punta con Chrome headless (`--dump-dom`) contra `npm run start`: `/admin` sin sesión redirige al login; el login con la administradora del seed entra al panel; cerrar sesión vuelve al login. Dejar constancia del resultado en el resumen de la tarea.

## 6. Seed y documentación

- [x] 6.1 Implementar `scripts/seed-admin.ts` y el script `db:seed-admin` en `package.json` (lee `ADMIN_USUARIO` y `ADMIN_PASSWORD`, valida con Zod 12+ caracteres, `insert … on conflict do nothing`, no imprime la contraseña, avisa si el usuario ya existía). Pruebas de integración de la función de alta: alta correcta, usuario existente no cambia el hash, contraseña corta falla. Verificar con `npm run test` y corriendo el script contra el contenedor.
- [x] 6.2 Agregar `.env.example` (sin valores) y actualizar `README.md` con `AUTH_SECRET`, el seed, el bloqueo de 15 min y el procedimiento manual de recuperación de contraseña; actualizar la sección de comandos de `CLAUDE.md` si hay un comando nuevo. Verificar que `.env.local` sigue ignorado y que no hay secretos en archivos versionables (revisión con `grep` de `AUTH_SECRET=`/`ADMIN_PASSWORD=`).

## 7. Integración final

- [x] 7.1 Correr `npm run lint`, `npm run build` y `npm run test` completos y confirmar que los 98 tests anteriores siguen pasando junto con los nuevos. Verificar que `openspec validate autenticacion-del-panel --strict` pasa.

## Workflow follow-up

- Archivar el change con `/opsx:archive` tras revisar el resultado (los specs `admin-authentication` y `admin-access-control` se crean y `studio-reference-data` se actualiza).
- Pendiente aparte, ya anotado en #2: aplicar las migraciones (`0000`–`0003`) a Neon real y ejecutar el seed allí; definir `AUTH_SECRET` en Vercel.
