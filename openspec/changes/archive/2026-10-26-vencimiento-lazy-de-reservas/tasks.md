# Tasks

## 1. Regla de vencimiento y disponibilidad

- [x] 1.1 Crear `src/lib/reserva/vencimiento.ts` con `PLAZO_VENCIMIENTO_MINUTOS = 20` y `condicionVencida(ahora)` (fragmento SQL de Drizzle: `pendiente_pago`, sin número de operación, sin motivo de rechazo y `creada_en` estrictamente anterior a `ahora` menos el plazo). Agregar helper `crearReservaVencida` o usar `crearReserva` con `creadaEn` explícito en `tests/support/fixtures.ts` si hace falta. Pruebas de integración con Postgres real de la regla: 19, 20 y 21 minutos; con motivo de rechazo; en `pendiente_validacion` y `confirmada`; cancelada. Verificar con `npm run test`.
- [x] 1.2 En `src/lib/disponibilidad/consulta.ts`, unir `reserva` en la consulta de líneas activas y excluir las que cumplan `condicionVencida(ahora)`; actualizar el comentario de la función. No tocar `calcularHuecos` ni seleccionar datos de la clienta. Actualizar `consulta.int.test.ts` (la reserva pendiente que ocupa pasa a ser reciente) y agregar: vencida libre, de 19 minutos ocupada, devuelta por rechazo ocupada, en validación y confirmada ocupadas. Verificar con `npm run test`.

## 2. Cancelar y reintentar dentro de la transacción

- [x] 2.1 En `vencimiento.ts`, implementar `liberarVencidasEnConflicto(tx, { maquilladoraId, inicio, fin }, ahora)` (consultas en serie: líneas activas solapadas con su reserva; `UPDATE` condicionado por reserva vencida con `RETURNING id`; líneas de las canceladas a `activa = false`; devuelve canceladas y bloqueantes) e `insertarLineaLiberandoVencidas(tx, valoresLinea, ahora)` (insert en savepoint con `tx.transaction`, solo `23P01`/`40P01` activan la liberación, hasta 3 reintentos, resultado `"insertada"` u `"ocupado"`, errores ajenos se relanzan). Pruebas unitarias con transacción simulada (error ajeno se relanza, `"ocupado"` sin vencidas, tope de reintentos). Verificar con `npm run test:unit`.
- [x] 2.2 Integrar en `src/lib/reserva/crear.ts`: dentro de `db.transaction`, insertar la reserva y llamar a `insertarLineaLiberandoVencidas`; si devuelve `"ocupado"`, lanzar un error interno (`HorarioOcupado`) que deshace toda la transacción y traducirlo fuera a `horario_no_disponible`. Mantener intactos el atajo de idempotencia, la revalidación fuera de la transacción, la traducción de `23P01`/`40P01` y el `23505` de la clave. Verificar con `npm run test` (las pruebas existentes de `crear.int.test.ts` y `crear.atomicidad.int.test.ts` siguen en verde).
- [x] 2.3 Pruebas de integración en `src/lib/reserva/vencimiento.int.test.ts` con Postgres real: creación sobre una vencida (queda `cancelada` con motivo `vencida`, todas sus líneas inactivas, CHECKs satisfechos, nueva con línea activa y monto correcto); vencida con varias líneas; dos vencidas en conflicto; vencida más vigente (no se cancela ninguna y `horario_no_disponible`); ocupada por una devuelta por rechazo; todo o nada (falla forzada después de cancelar la vencida, la vencida sigue sin cancelar); dos reservas simultáneas por el horario de una vencida repetidas varias veces (una gana, la vencida se cancela una sola vez, sin filas a medias); varias reservas sin pagar del mismo teléfono se crean. Verificar con `npm run test`.

## 3. Carrera contra el ingreso del número de operación

- [x] 3.1 Pruebas de integración con Postgres real y dos conexiones (en el mismo archivo o `vencimiento-carrera.int.test.ts`, con limpieza manual como `exclusion-concurrencia.int.test.ts`): (a) una transacción ejecuta el `UPDATE` del ingreso (`numero_operacion` y `estado = 'pendiente_validacion'`) sin confirmar, `crearReservaIndividual` espera, se confirma, y la reserva original se conserva con su línea activa mientras la nueva recibe `horario_no_disponible` sin filas a medias; (b) la cancelación por vencimiento se confirma primero y la reserva sigue `cancelada` con motivo `vencida` (un `UPDATE` posterior del número no la reactiva). Verificar con `npm run test`.

## 4. Cierre

- [x] 4.1 Actualizar la sección del flujo de reserva de `README.md`: la reserva pendiente vence a los 20 minutos sin número de operación y se libera al chocar; las devueltas por rechazo no vencen. Verificar leyendo la sección.
- [x] 4.2 Correr `npm run lint`, `npm run build` y `npm run test` completos y comprobar que las pruebas anteriores siguen pasando junto con las nuevas y que `openspec validate vencimiento-lazy-de-reservas --strict` pasa.

## Workflow follow-up

- Archivar con `/opsx:archive` tras revisar el resultado (se crea la spec `booking-expiration`; se modifican `slot-availability` e `individual-booking`).
- Para #9 (reserva grupal): llamar a `insertarLineaLiberandoVencidas` por cada línea dentro de su transacción única y deshacer todo con `HorarioOcupado`; coordinar el orden de cambios en `crear.ts`.
- Para #10: reutilizar `condicionVencida` para decidir si el ingreso del número se rechaza por vencida, y mantener el `UPDATE` del ingreso condicionado a `estado = 'pendiente_pago'` para que la carrera quede cubierta.
