# Tasks

## 1. Base común

- [x] 1.1 Crear `src/lib/agenda/zona-horaria.ts` con `ZONA_STUDIO = "America/Lima"`, la conversión de texto `YYYY-MM-DDTHH:mm` (hora local del studio) a `Date` y la inversa a partes locales para mostrar, con `Intl.DateTimeFormat` y sin librerías; rechazar fechas inexistentes y horas locales inexistentes o ambiguas. Pruebas unitarias: 09:00 locales ↔ 14:00 UTC, ida y vuelta, `2026-02-30` y `25:00` rechazadas, y mismo resultado con distintos valores de `TZ` del proceso. Verificar con `npm run test:unit`.
- [x] 1.2 Crear `src/lib/agenda/esquemas.ts` con `horarioSchema` (día 0–6, `HH:mm` válidas y normalizadas, fin posterior al inicio con el error en `horaFin`) y `bloqueoSchema` (inicio y fin convertidos con 1.1, motivo recortado de 1 a 200, fin posterior con el error en `fin`), mensajes en español por campo. Pruebas unitarias: hora `24:00`, `9:5`, fin igual al inicio, día `7`, motivo vacío o solo espacios, motivo de 200 y de 201 caracteres, fecha `2026-02-30`, bloqueo válido. Verificar con `npm run test:unit`.

## 2. Horario semanal

- [x] 2.1 Implementar `src/lib/agenda/horarios.ts` (`listarHorarios` ordenado por día e inicio, `agregarHorario` con comprobación de solapamiento y alta en una sola transacción devolviendo `creado` o `solapado`, `quitarHorario(db, maquilladoraId, id)` con `WHERE id AND maquilladora_id`), con la base inyectada. Pruebas de integración con Postgres real: alta válida, dos tramos el mismo día, solapado rechazado, contiguos aceptados, mismo tramo en otro día aceptado, quitar existente, quitar inexistente sin error, quitar con la maquilladora equivocada no borra, y que las líneas de reserva no cambian. Verificar con `npm run test`.
- [x] 2.2 Crear `src/app/admin/(panel)/maquilladoras/[id]/agenda/actions.ts` con `agregarHorario` y `quitarHorario` (`await requerirAdmin()` como primera línea, luego Zod, luego la capa de datos; `refresh()` al terminar). Pruebas: con la sesión simulada como no autorizada no se invoca ninguna función de datos; entrada inválida devuelve errores por campo y valores conservados; tramo solapado devuelve el mensaje; éxito limpia el formulario. Verificar con `npm run test` y que `tests/auth/acciones-del-panel.test.ts` sigue en verde sin cambios.

## 3. Bloqueos de agenda

- [x] 3.1 Implementar `src/lib/agenda/bloqueos.ts` (`listarBloqueos` con los no terminados primero por inicio ascendente y los terminados después, `agregarBloqueo`, `quitarBloqueo(db, maquilladoraId, id)` con `WHERE id AND maquilladora_id`), con la base inyectada y sin comprobar contra reservas ni horarios. Pruebas de integración con Postgres real: alta y lectura con la misma hora local, orden futuros primero, pasado después, solapado con otro bloqueo aceptado, bloqueo sobre un turno ya reservado no modifica la línea, quitar existente, inexistente y con la maquilladora equivocada. Verificar con `npm run test`.
- [x] 3.2 Agregar `agregarBloqueo` y `quitarBloqueo` a `agenda/actions.ts` con las mismas garantías que 2.2 y pruebas equivalentes (sin sesión, entrada inválida con valores conservados, éxito limpia el formulario). Verificar con `npm run test` y que la prueba de convención sigue en verde.

## 4. Pantalla y navegación

- [x] 4.1 Crear `maquilladoras/[id]/agenda/page.tsx` (sesión con `requerirAdminOLogin()` dentro de `<Suspense>`, `idSchema` y `notFound()` si el id es inválido o no existe, sin filtrar por `activa`) con el horario semanal de lunes a domingo (estado "no trabaja ese día", tramos ordenados, botón "Quitar") y el formulario de alta de tramo con `useActionState`. Pruebas de componente con Testing Library: siete días en orden, día vacío, errores por campo, valores conservados, botón deshabilitado al enviar. Verificar con `npm run test:unit` y `npm run build`.
- [x] 4.2 Agregar a la misma pantalla la tabla de bloqueos (hora local, motivo, `badge` "Pasado" más texto, estado vacío, botón "Quitar") y el formulario de alta de bloqueo con `type="datetime-local"`. Pruebas de componente: bloqueo futuro y pasado, sin bloqueos, errores por campo y valores conservados. Verificar con `npm run test:unit` y `npm run build`.
- [x] 4.3 Agregar el enlace "Agenda" al listado de maquilladoras y a su pantalla de edición. Prueba de componente que compruebe el enlace y su destino `/admin/maquilladoras/<id>/agenda`. Verificar con `npm run test:unit`.
- [x] 4.4 Actualizar `README.md` con una línea sobre la agenda por maquilladora (horario semanal y bloqueos, en hora de Lima, y que quitar es un borrado real). Verificar leyendo la sección "Panel del studio".

## 5. Integración final

- [x] 5.1 Correr `npm run lint`, `npm run build` y `npm run test` completos; confirmar que los 337 tests anteriores siguen pasando junto con los nuevos y que `openspec validate panel-horarios-y-bloqueos --strict` pasa. Verificar con `curl -I` sobre `npm run start` que `/admin/maquilladoras/1/agenda` sin sesión responde 307 hacia `/admin/login` con `callbackUrl`.
- [ ] 5.2 Recorrido manual con Chrome headless contra la base de Neon (cargar un tramo, un solapado rechazado, un bloqueo con hora local correcta y quitar ambos). Requiere `AUTH_SECRET` en `.env.local` y una administradora creada con `npm run db:seed-admin`; si no están, dejarlo anotado como pendiente en el resumen.

## Workflow follow-up

- Archivar el change con `/opsx:archive` tras revisar el resultado (se crean los specs `work-schedule-management` y `agenda-block-management`).
- Confirmar con el studio la zona horaria antes de cargar bloqueos reales (pregunta abierta del diseño).
- Para #6: leer `horario_trabajo` y `bloqueo_agenda` con las funciones de `src/lib/agenda/`, interpretar los bloqueos como rangos `timestamptz` y los tramos como hora local de `ZONA_STUDIO`.
- Pendiente heredado de #4: la tarea 5.2 del change `panel-catalogo-y-maquilladoras` (recorrido manual), ahora desbloqueable con la base de Neon.
