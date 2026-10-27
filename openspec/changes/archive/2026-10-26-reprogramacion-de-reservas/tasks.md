## 1. Regla de plazo y lectura de turnos

- [x] 1.1 Crear `src/lib/reprogramacion/plazo.ts` con `ANTICIPACION_MINIMA_HORAS = 24` y `puedeReprogramarse(inicio, ahora)`. Verificar: prueba unitaria con exactamente 24 h (sí), 23 h 59 min (no) y turno pasado (no).
- [x] 1.2 Crear `src/lib/reprogramacion/turnos.ts` con `obtenerTurnosReprogramables(db, token, ahora)` (id de línea, inicio, fin, maquilladora, `puedeReprogramar`; vacío si la reserva no está `confirmada` o el token no existe). Verificar: prueba de integración con reservas en cada estado, grupal de tres y token ajeno.

## 2. Disponibilidad y liberación sin el propio turno

- [x] 2.1 Agregar a `consultarDisponibilidad` (`src/lib/disponibilidad/consulta.ts`) el parámetro opcional `ignorarLineaId`. Verificar: prueba de integración que con él se ofrece 10:30 sobre un turno propio de 10:00 a 11:00 y que sin él las pruebas existentes no cambian.
- [x] 2.2 Agregar a `liberarVencidasEnConflicto` (`src/lib/reserva/vencimiento.ts`) el parámetro opcional `excluirLineaId`. Verificar: las pruebas existentes de vencimiento siguen en verde y una nueva comprueba que la línea excluida no cuenta como bloqueante.
- [x] 2.3 Crear `src/lib/reprogramacion/actualizar-linea.ts` con `actualizarLineaLiberandoVencidas` (savepoint, `UPDATE` condicionado al horario y maquilladora vistos, liberar vencidas y reintentar). Verificar: prueba de integración con destino libre, vencida (se cancela), vigente (`ocupado` y la vencida sigue sin cancelar), vencida más vigente, y cruce con el propio horario más una vencida.

## 3. Operación de reprogramación

- [x] 3.1 Crear `src/lib/reprogramacion/reprogramar.ts` con `reprogramarTurno(db, solicitud, ahora)`: lectura y validaciones fuera de la transacción (estado, plazo, pertenencia al token, maquilladora activa, revalidación con disponibilidad), y dentro `SELECT ... FOR UPDATE` de la reserva `confirmada` más la actualización de 2.3. Traduce `23P01` y `40P01` a `horario_no_disponible`. Verificar: prueba de integración de éxito (inicio, fin y maquilladora cambian; estado, número, monto y precio no; otras integrantes intactas).
- [x] 3.2 Pruebas de rechazo: horario ocupado deja el turno original intacto, bloqueo de agenda, fuera de horario, reserva en cada estado no confirmado, menos de 24 h, turno de otra reserva, maquilladora inactiva. Verificar: `npm run test` con Docker, todas en verde.
- [x] 3.3 Pruebas de idempotencia: doble clic secuencial y con `Promise.all` responde éxito una sola vez; pantalla desactualizada responde `turno_cambiado`. Verificar: prueba de integración.
- [x] 3.4 Pruebas de carrera con dos conexiones (patrón de `vencimiento-carrera.int.test.ts`): dos reprogramaciones al mismo horario (gana una); reprogramación contra una cancelación de la reserva (en ambos órdenes, con líneas inactivas al final); reprogramación sobre una vencida contra su ingreso de número. Verificar: pruebas de integración deterministas, limpiando con `beforeEach`.

## 4. Pantalla y acción pública

- [x] 4.1 Crear `src/app/reservas/[token]/reprogramar/actions.ts` (Server Action con Zod; token, id de turno, maquilladora y inicio nuevos, y horario visto; sin `requerirAdmin()`; `redirect` a la página de estado al éxito) y su procesador de formulario puro. Verificar: prueba unitaria de validación y de cada resultado a su mensaje.
- [x] 4.2 Crear `src/app/reservas/[token]/reprogramar/page.tsx` (detrás de `<Suspense>`, `notFound()` para token o turno inválidos, `ahora` leído tras `params`) y el componente `src/components/publico/pantalla-reprogramacion.tsx` (maquilladora, día, horarios como enlaces, resumen "de X a Y" y formulario de confirmación con botón deshabilitado al enviar). Verificar: pruebas de componente de cada estado, incluido "horario ya no disponible" que conserva maquilladora y día.
- [x] 4.3 Crear `src/components/publico/seccion-de-reprogramacion.tsx` y agregarla en `src/app/reservas/[token]/page.tsx` (acceso por turno, deshabilitado con explicación pasado el plazo, ausente si la reserva no está confirmada). Verificar: prueba de componente con reserva individual, grupal, plazo vencido y no confirmada.
- [x] 4.4 Verificar que `src/app/reservas/cabeceras.test.ts` sigue en verde y que la subruta hereda las cabeceras de `/reservas/:path*`. Verificar: ejecutar esa prueba.

## 5. Cierre

- [x] 5.1 Ejecutar `npm run lint`, `npm run test:unit` y `npm run test` (con Docker) y `npm run build`. Verificar: todo en verde, sin migraciones nuevas (`git`-less: comprobar que `drizzle/` no cambió).
