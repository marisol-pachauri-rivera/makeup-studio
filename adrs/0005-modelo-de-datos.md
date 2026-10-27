# ADR 0005: Modelo de datos con reserva y líneas de reserva

## Estado

Aceptado

## Contexto

No hay `Design.md`, por lo que el modelo se deriva solo del PRD. El PRD exige: catálogo de
servicios con precio, varias maquilladoras con agenda propia, reserva individual y grupal (con
todas las personas definidas antes de reservar), pago manual con número de operación validado por
el studio, y cancelación y reprogramación por la clienta. El ADR 0003 exige que Postgres impida
solapamientos de horario por maquilladora, y el ADR 0004 exige un token de acceso por reserva.
En un grupo, el pago y el estado son del conjunto, pero la ocupación de agenda es por persona.

## Decisión

Entidades y relaciones principales (PostgreSQL, definidas con Drizzle):

- **servicio**: nombre, descripción, precio, duración en minutos, activo.
- **maquilladora**: nombre, activa.
- **horario_trabajo**: maquilladora, día de la semana, hora de inicio y fin (disponibilidad
  recurrente que el studio gestiona en el panel).
- **bloqueo_agenda**: maquilladora, rango de fecha y hora, motivo (ausencias o cierres cargados
  por el studio).
- **reserva**: token de acceso (único, no adivinable), nombre y teléfono de contacto de la
  clienta, estado (`pendiente_pago`, `pendiente_validacion`, `confirmada`, `cancelada`), número de
  operación (nulo hasta que se ingresa), monto total, estado de reembolso (`no_aplica`,
  `pendiente`, `realizado`), motivo de rechazo (nulo salvo tras un rechazo de pago), motivo de
  cancelación (`vencida`, `clienta`, `studio`; nulo si no está cancelada), fechas de creación y de
  validación. El vencimiento lazy (ADR 0003) se calcula con la fecha de creación y se aplica solo
  a reservas en `pendiente_pago` sin número de operación y sin motivo de rechazo.
- **reserva_linea**: reserva, nombre de la persona a maquillar, servicio, maquilladora, inicio y
  fin del turno, precio del servicio al momento de reservar (copia) y un indicador `activa`.
  Una reserva individual es una reserva con una línea; una grupal tiene una línea por persona y
  se rechaza si faltan integrantes.
- **usuario_admin**: credenciales del personal del studio que valida pagos.

**Clave de idempotencia (agregada al implementar la reserva individual).** `reserva` guarda además una
`clave_idempotencia` (`uuid`, opcional, `UNIQUE`) que el cliente genera por intento de reserva. Concreta
la "clave generada por intento" del ADR 0009: reenviar una clave que ya creó una reserva devuelve esa
misma reserva en vez de crear otra, también si los dos envíos llegan a la vez. Es opcional para que
convivan reservas sin clave, igual que `numero_operacion` convive con nulos.

La restricción de exclusión en Postgres (ADR 0003) se define sobre `reserva_linea` por
maquilladora y rango de tiempo, solo para líneas con `activa = true`. Cancelar una reserva marca
sus líneas como inactivas, y reprogramar actualiza inicio y fin de la línea manteniendo el número
de operación de la reserva.

**Rechazo de pago.** Cuando el studio rechaza el pago de una reserva en `pendiente_validacion`
(número mal escrito, no coincide con ningún movimiento, monto incorrecto, etc.), la reserva vuelve a
`pendiente_pago` en una sola transacción: el número de operación se pone en nulo (queda libre bajo
el `UNIQUE`), se guarda el motivo de rechazo y las líneas siguen activas, por lo que el horario se
conserva. La clienta ve el motivo en su página de estado e ingresa un nuevo número, con lo que la
reserva vuelve a `pendiente_validacion` y el motivo se limpia. Cancelar sigue siendo una acción
distinta, que libera el horario.

## Alternativas consideradas

- **Una reserva por persona agrupadas por `grupo_id`** — restricción de solapamiento directa,
  pero el pago y el estado del grupo quedan repartidos entre varias filas y pueden desincronizarse.
  No fue elegida por el usuario.
- **Reserva única con las personas en una lista JSON** — la más simple de escribir, pero Postgres
  no puede imponer la no superposición de horarios sobre datos dentro de un JSON, lo que
  contradice el ADR 0003.

## Consecuencias

- Pago y estado únicos por grupo, y ocupación de agenda controlada por línea y verificada por la
  base de datos.
- Guardar el precio de cada línea al reservar evita que un cambio de precio del catálogo altere
  reservas ya hechas ni los montos a reembolsar.
- El indicador `activa` de la línea duplica información del estado de la reserva y debe
  mantenerse sincronizado por la aplicación (dentro de una transacción), porque la restricción de
  exclusión no puede consultar otra tabla. Es un costo de consistencia aceptado.
- Reservas de varias líneas deben crearse en una sola transacción, de modo que si una línea
  choca, ninguna queda guardada.
- Sin comprobante adjunto, la evidencia del pago es solo el número de operación. Una restricción
  `UNIQUE` sobre el número de operación de `reserva` impide reutilizarlo en otra reserva (regla
  confirmada por el usuario y reflejada en el PRD); un número mal tipeado que coincida con uno
  ajeno queda rechazado y la clienta debe corregirlo. El número se guarda **normalizado** (sin espacios
  sobrantes y en mayúsculas, de 4 a 30 caracteres alfanuméricos y guiones), para que la unicidad compare
  lo mismo que ve el studio: "op-1" y "OP-1" son el mismo número.
- Al rechazar un pago el número se borra, por lo que el `UNIQUE` no lo mantiene "quemado" y la
  clienta puede corregirlo sin perder el horario. Costo: se pierde el rastro del número rechazado
  (solo queda el motivo), y una reserva rechazada que la clienta no corrige sigue ocupando el
  horario como cualquier `pendiente_pago` abandonada (ADR 0003), hasta que el studio la cancele.
