# Tasks

## 1. Soporte de tests del modelo

- [x] 1.1 Crear `tests/support/rechazo.ts` con `esperarRechazo(tx, fn)`, que ejecuta `fn` dentro de un `SAVEPOINT` y devuelve el código SQLSTATE y el nombre de la restricción del error (`cause.code` y `cause.constraint`), y falla si `fn` no es rechazada. Verificar con un test de integración `tests/modelo/rechazo.int.test.ts` que provoca una violación `UNIQUE` en una tabla temporal, obtiene `23505` y puede seguir usando la transacción después

## 2. Datos de referencia (migración 0000)

- [x] 2.1 Definir en `src/db/schema.ts` las tablas `servicio`, `maquilladora`, `horario_trabajo`, `bloqueo_agenda` y `usuario_admin` con claves primarias identity, `timestamptz` para instantes, `time` y `smallint` para el horario, `numeric(10,2)` para el precio, claves foráneas `ON DELETE RESTRICT`, `CHECK` de precio, duración, rango de tiempo y día 0 a 6, `UNIQUE` en `usuario_admin.usuario` e índices de las claves foráneas. Verificar con `npx tsc --noEmit` sin errores
- [x] 2.2 Ejecutar `npm run db:generate`, revisar el SQL de `drizzle/0000_*.sql` (que contenga los `CHECK`, los `UNIQUE` y los `ON DELETE RESTRICT`) y confirmar que no incluye ninguna tabla de reserva. Verificar que `npm run db:generate` repetido responde "No schema changes"
- [x] 2.3 Escribir `tests/modelo/referencia.int.test.ts` con un caso por escenario del spec `studio-reference-data`: valores por defecto, precio negativo, duración no positiva, borrado de maquilladora con referencias, horario con fin anterior o día 7, bloqueo con rango invertido, usuario repetido y horario de maquilladora inexistente. Verificar con `npm run test` que pasa contra Postgres real

## 3. Reservas y líneas (migración 0001)

- [x] 3.1 Agregar a `src/db/schema.ts` las tablas `reserva` y `reserva_linea`: token `uuid` con `gen_random_uuid()`, `UNIQUE` en token y en número de operación, estado, reembolso y motivo de cancelación como `text` con `CHECK`, los `CHECK` de coherencia entre estado y número de operación y entre estado y motivo de cancelación, monto y precio no negativos, `fin > inicio` en líneas, `activa` verdadero por defecto, y el índice de `reserva_linea.reserva_id`. Verificar con `npx tsc --noEmit` sin errores
- [x] 3.2 Ejecutar `npm run db:generate`, revisar `drizzle/0001_*.sql` (que no toque las tablas de referencia ni incluya aún la exclusión) y verificar que un segundo `npm run db:generate` responde "No schema changes"
- [x] 3.3 Crear `tests/support/fixtures.ts` con funciones que insertan una maquilladora, un servicio y una reserva válidos con valores por defecto reemplazables. Verificar con un test que cada fixture inserta y devuelve la fila creada
- [x] 3.4 Escribir `tests/modelo/reserva.int.test.ts` con un caso por escenario del spec `reservation-data`: valores por defecto, estado y reembolso inválidos, monto negativo, token generado y repetido, número de operación duplicado, nulos múltiples y número liberado, las tres coherencias entre estado y número, la coherencia del motivo de cancelación, línea válida, turno invertido, precio copiado ante cambio del catálogo y reserva grupal de tres líneas. Verificar con `npm run test` que pasa contra Postgres real

## 4. Exclusión de solapamiento (migración 0002)

- [x] 4.1 Ejecutar `npx drizzle-kit generate --custom --name=reserva_linea_exclusion` y escribir en el archivo la extensión `btree_gist` y la restricción `reserva_linea_sin_solapamiento` (`EXCLUDE USING gist` por maquilladora y `tstzrange(inicio, fin, '[)')`, `WHERE (activa)`). Verificar con `npm run db:migrate` sobre un Postgres limpio que las tres migraciones se aplican sin error
- [x] 4.2 Escribir `tests/modelo/exclusion.int.test.ts` con un caso por escenario del spec `schedule-overlap-guard`: solapamiento parcial y total, turnos contiguos, maquilladoras distintas, línea inactiva que no bloquea ni es bloqueada, desactivar y reactivar, mover una línea a horario libre y ocupado, grupo de dos líneas revertido por choque, código `23P01` con el nombre `reserva_linea_sin_solapamiento`, y una reserva `pendiente_pago` creada hace más de 20 minutos que sigue bloqueando. Verificar con `npm run test` que pasa
- [x] 4.3 Agregar el test de concurrencia: dos conexiones confirman a la vez una línea activa para la misma maquilladora y el mismo rango; exactamente una se confirma y la otra falla con `23P01` o `40P01` (deadlock detectado), sin dejar líneas solapadas, y el estado se limpia con `TRUNCATE ... CASCADE`. Verificar repitiendo el test 20 veces seguidas sin fallos intermitentes
- [x] 4.4 Agregar `tests/modelo/migraciones.int.test.ts`, que verifica que están registradas las tres migraciones en la tabla de migraciones de Drizzle y que existen en el catálogo de Postgres la extensión `btree_gist` y la restricción de exclusión. Verificar con `npm run test` que pasa
- [x] 4.5 Documentar en `CLAUDE.md` cómo agregar una migración a mano (`drizzle-kit generate --custom`) para lo que Drizzle no expresa, y la advertencia de que una migración que reconstruya `reserva_linea` debe repetir la exclusión. Verificar que el comando documentado funciona tal como está escrito

## 5. Verificación integral

- [x] 5.1 Ejecutar `npm run lint`, `npx tsc --noEmit`, `npm run build` y `npm run test` seguidos y verificar que los cuatro pasan, y que `npm run db:generate` final responde "No schema changes"
- [x] 5.2 Verificar contra el alcance del ítem #2 del backlog revisando el diff: solo existen las 7 entidades, la exclusión, los `UNIQUE`, el token y sus tests, sin Server Actions, Zod, Auth.js, seed ni pantallas, y `src/db/client.ts`, `src/db/retry.ts` y `src/app/` quedan sin cambios

## Workflow follow-up

- Archivar el change tras la revisión del ítem #2.
- Aplicar las migraciones a la base Neon real al desplegar, verificando que `btree_gist` está disponible.
