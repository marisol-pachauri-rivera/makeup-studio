# Tasks

## 1. Base común

- [x] 1.1 Leer `node_modules/next/dist/docs/01-app/02-guides/forms.md` y confirmar la API vigente de `useActionState`, `redirect` y `notFound` en Next 16.4; agregar con el CLI de shadcn los componentes `table`, `textarea` y `badge`. Verificar que los tres archivos existen en `src/components/ui/` y que `npm run build` pasa.
- [x] 1.2 Crear `src/lib/catalogo/esquemas.ts` con `servicioSchema`, `maquilladoraSchema` e `idSchema` (precio como texto normalizado sin `Number`, duración 1–720, nombre 1–100, descripción hasta 500, mensajes en español). Pruebas unitarias: precio `350`, `350,50`, `350.505`, `-1`, `1e3`, vacío; duración 0, 60, 721, `1.5`; nombre solo con espacios; descripción omitida; id `0`, `abc`, `7`. Verificar con `npm run test:unit`.

## 2. Servicios

- [x] 2.1 Implementar `src/lib/catalogo/servicios.ts` (`listarServicios`, `obtenerServicio`, `crearServicio`, `actualizarServicio`, `cambiarActivoServicio`, con la base inyectada; `UPDATE … RETURNING` para detectar inexistentes). Pruebas de integración con Postgres real: alta activa por defecto, precio exacto `350.50`, edición, desactivar y reactivar, inexistente devuelve "no encontrado", editar el precio no cambia el precio de una línea de reserva existente, y borrar un servicio con líneas sigue siendo rechazado por la base. Verificar con `npm run test`.
- [x] 2.2 Crear `src/app/admin/(panel)/servicios/actions.ts` (`crearServicio`, `actualizarServicio`, `cambiarEstadoServicio`; `await requerirAdmin()` como primera línea, luego Zod, luego la capa de datos, `redirect` fuera de `try/catch`). Pruebas: con la sesión simulada como no autorizada ninguna función de datos se invoca; entrada inválida devuelve errores por campo y valores conservados; éxito redirige. Verificar con `npm run test` y que `tests/auth/acciones-del-panel.test.ts` sigue en verde sin cambios.
- [x] 2.3 Crear las páginas `servicios/page.tsx` (lista con activos e inactivos, estado con `badge` y texto, acción de activar/desactivar, estado vacío), `servicios/nuevo/page.tsx`, `servicios/[id]/page.tsx` (`notFound()` si el id es inválido o no existe) y el formulario compartido con `useActionState` (errores por campo, valores conservados, botón deshabilitado mientras envía). Cada página lee la sesión con `requerirAdminOLogin()` dentro de `<Suspense>`. Pruebas de componente con Testing Library: errores por campo, valores conservados, botón deshabilitado. Verificar con `npm run test:unit` y `npm run build`.

## 3. Maquilladoras

- [x] 3.1 Implementar `src/lib/catalogo/maquilladoras.ts` con las mismas funciones que servicios. Pruebas de integración con Postgres real: alta activa por defecto, nombre repetido permitido, renombrar sin tocar horarios, bloqueos ni líneas, desactivar y reactivar, inexistente, y borrar con historial sigue rechazado por la base. Verificar con `npm run test`.
- [x] 3.2 Crear `src/app/admin/(panel)/maquilladoras/actions.ts` con `crearMaquilladora`, `actualizarMaquilladora` y `cambiarEstadoMaquilladora`, con las mismas garantías que 2.2 y pruebas equivalentes. Verificar con `npm run test` y que la prueba de convención sigue en verde.
- [x] 3.3 Crear las páginas de lista, alta y edición de maquilladoras y su formulario, reutilizando el patrón de 2.3 (estado vacío, `badge` más texto, `notFound()`, sesión dentro de `<Suspense>`). Pruebas de componente equivalentes a 2.3. Verificar con `npm run test:unit` y `npm run build`.

## 4. Navegación y documentación

- [x] 4.1 Agregar los enlaces "Servicios" y "Maquilladoras" a la cabecera de `src/app/admin/(panel)/layout.tsx` y accesos desde `/admin`. Prueba de componente que compruebe los enlaces y sus destinos. Verificar con `npm run test:unit`.
- [x] 4.2 Actualizar `README.md` con una línea sobre las secciones del panel (qué se administra y que no se borra, solo se desactiva). Verificar leyendo la sección "Panel del studio".

## 5. Integración final

- [x] 5.1 Correr `npm run lint`, `npm run build` y `npm run test` completos; confirmar que los 208 tests anteriores siguen pasando junto con los nuevos y que `openspec validate panel-catalogo-y-maquilladoras --strict` pasa. Verificar con `curl -I` sobre `npm run start` que `/admin/servicios` y `/admin/maquilladoras` sin sesión responden 307 hacia `/admin/login` con `callbackUrl`.
- [ ] 5.2 Recorrido manual con Chrome headless contra una base real (alta, edición, desactivar y reactivar de un servicio y de una maquilladora, y error de validación). Queda condicionado a poder iniciar sesión de verdad (tareas 5.2 y 5.3 de #3, pendientes de una base Neon); si sigue sin haber base, dejarlo anotado como pendiente en el resumen.

## Workflow follow-up

- Archivar el change con `/opsx:archive` tras revisar el resultado (los specs `service-catalog-management` y `makeup-artist-management` se crean).
- Pendiente aparte, heredado de #3: aplicar las migraciones `0000`–`0003` a Neon real, correr el seed allí y definir `AUTH_SECRET` en Vercel.
- Para #6: tratar como no elegibles los servicios y maquilladoras inactivos y, si cachea lecturas con etiquetas, invocar `updateTag` desde las acciones de este ítem.
