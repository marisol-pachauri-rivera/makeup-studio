# Tasks

## 1. Base de fechas

- [x] 1.1 Crear `src/lib/agenda-panel/rango.ts` con `limitesDelDia(fecha)` (instantes UTC de las 00:00 locales de `fecha` y del día siguiente, con el mismo respaldo que `finDeVentana`) y `semanaDe(fecha)` (siete fechas, lunes a domingo). Pruebas unitarias: día normal, 03:00 UTC del 25/12 es el 24/12 con `hoyLocal`, cruce de mes y de año, domingo cae al final de su semana, resultado igual con distintos `TZ` del proceso. Verificar con `npm run test:unit`.

## 2. Consulta y armado

- [x] 2.1 Crear `src/lib/agenda-panel/consulta.ts` con `obtenerAgendaDelDia(db, fecha, ahora)`: maquilladoras, `listarHorarios` filtrado por `diaDeLaSemana(fecha)`, bloqueos y líneas `activa = true` que se solapan con el día, uniendo `reserva` y `servicio`, con `vencida` calculada con `condicionVencida(ahora)`. Solo lecturas, base inyectada, sin transacción. Pruebas de integración con Postgres real (`beforeEach` limpia): solo activas, cancelada excluida, grupal con tres líneas, dos maquilladoras separadas, inactiva con turnos incluida y sin turnos excluida, borde de día en Lima (23:30 local cuenta en su día, 00:00 del siguiente no), turno y bloqueo que cruzan la medianoche en ambos días. Verificar con `npm run test`.
- [x] 2.2 Pruebas de integración de coherencia y concurrencia: una reserva vencida figura con `vencida = true` y el mismo turno aparece libre en `consultarDisponibilidad`; una reserva devuelta a `pendiente_pago` por rechazo no es vencida; una lectura con otra transacción que tiene un alta sin confirmar no la ve ni queda bloqueada. Verificar con `npm run test`.
- [x] 2.3 Crear `src/lib/agenda-panel/armar-dia.ts` (`armarDia`, puro): agrupa por maquilladora, mezcla turnos y bloqueos en una línea de tiempo por hora de inicio, descarta inactivas sin turnos, da horas con `aPartesLocales` y la etiqueta de estado ("Pendiente de pago", "Pago rechazado", "Pendiente de validación", "Confirmada", más "Plazo vencido"). Pruebas unitarias: orden, mezcla con bloqueos, día sin horario, etiquetas, 15:00 UTC se muestra 10:00, nombre de contacto solo si difiere de la persona. Verificar con `npm run test:unit`.

## 3. Pantalla

- [x] 3.1 Crear en `src/app/admin/(panel)/agenda/` los componentes `navegacion-dias.tsx` (Anterior, Siguiente, Hoy, franja de la semana con el día mostrado indicado por texto y `<form method="get">` con `input type="date"`) y `agenda-maquilladora.tsx` (horario del día o "No trabaja este día", tabla cronológica con `table` y `badge`, estados escritos, estado vacío "Sin turnos ni bloqueos"). Sin `actions.ts` ni componentes de cliente. Pruebas de componente con Testing library: enlaces con `?fecha=`, "Plazo vencido" en texto, bloqueo etiquetado "Bloqueo", estado vacío, enlace "Horario y bloqueos" a `/admin/maquilladoras/<id>/agenda`. Verificar con `npm run test:unit`.
- [x] 3.2 Crear `src/app/admin/(panel)/agenda/page.tsx`: dentro de `<Suspense>`, `await requerirAdminOLogin()`, luego `leerParametros({ fecha })` (inválida equivale a hoy), luego `new Date()`, `obtenerAgendaDelDia` con `getDb()` y los componentes. Con `metadata` propia. Verificar con `npm run lint` y `npm run build`, y con `curl -I` sobre `npm run start` que `/admin/agenda` sin sesión responde 307 hacia `/admin/login`.
- [x] 3.3 Prueba de convención `src/app/admin/(panel)/agenda/solo-lectura.test.ts` que falle si existe `actions.ts` o `"use server"` en esa carpeta. Verificar con `npm run test:unit` y que `tests/auth/acciones-del-panel.test.ts` sigue en verde sin cambios.

## 4. Navegación y documentación

- [x] 4.1 Agregar la sección "Agenda" (`/admin/agenda`) a `SECCIONES_DEL_PANEL` en `src/components/panel/navegacion.tsx` y extender `navegacion.test.tsx` (enlace de cabecera y acceso de inicio). Coordinar con #11, que toca el mismo archivo. Verificar con `npm run test:unit`.
- [x] 4.2 Agregar a `README.md` una línea en "Panel del studio" sobre la agenda del día por maquilladora (solo lectura, hora de Lima, `?fecha=`), distinguiéndola de "Horario y bloqueos". Verificar leyendo la sección.

## 5. Integración final

- [x] 5.1 Correr `npm run lint`, `npm run build` y `npm run test` completos y `openspec validate panel-agenda-por-maquilladora --strict`. Verificar que no hubo cambios de esquema ni migraciones.
- [ ] 5.2 Recorrido manual con la base de Neon (día con turnos, vencida marcada, navegación, celular a 375 px sin scroll horizontal). Requiere `AUTH_SECRET` y una administradora creada con `npm run db:seed-admin`; si faltan, anotarlo como pendiente.

## Antes de implementar

- Resolver la decisión abierta del `design.md`: calendario a mano o con librería (ADR 0010). Si se elige librería, se redacta antes un ADR nuevo o actualizado y se revisan las tareas 3.x.
