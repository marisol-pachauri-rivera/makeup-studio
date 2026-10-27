## ADDED Requirements

### Requirement: Definición de reserva vencida
Una reserva SHALL considerarse vencida cuando está en `pendiente_pago`, no tiene número de operación, no tiene motivo de rechazo y han pasado más de 20 minutos desde su creación. El plazo MUST ser una constante configurable. Una reserva en `pendiente_pago` por un rechazo de pago MUST NOT vencer nunca, y tampoco una en `pendiente_validacion`, `confirmada` o `cancelada`.

#### Scenario: Sin pago pasado el plazo
- **WHEN** una reserva `pendiente_pago` sin número ni motivo de rechazo tiene 21 minutos de creada
- **THEN** está vencida

#### Scenario: Dentro del plazo
- **WHEN** la misma reserva tiene 19 minutos
- **THEN** no está vencida

#### Scenario: Justo en el plazo
- **WHEN** la reserva tiene exactamente 20 minutos
- **THEN** no está vencida (vence con más de 20 minutos)

#### Scenario: Devuelta por rechazo
- **WHEN** una reserva volvió a `pendiente_pago` con motivo de rechazo y tiene más de 20 minutos
- **THEN** no está vencida

#### Scenario: Otros estados
- **WHEN** una reserva en `pendiente_validacion` o `confirmada` tiene más de 20 minutos
- **THEN** no está vencida

### Requirement: Cancelación lazy de la reserva vencida al chocar
Cuando una línea nueva choca con la exclusión de horario y todas las líneas en conflicto son de reservas vencidas, el sistema SHALL cancelarlas (motivo `vencida`, todas sus líneas inactivas) y reintentar el insert en la misma transacción. Si alguna es de una reserva no vencida, MUST NOT cancelarse nada y la clienta MUST recibir "horario no disponible".

#### Scenario: Horario ocupado por una vencida
- **WHEN** una clienta reserva un horario cuya línea activa pertenece a una reserva vencida
- **THEN** la reserva vencida queda `cancelada` con motivo `vencida` y sus líneas inactivas, y la nueva reserva queda creada con su línea activa

#### Scenario: Ocupado por una vigente
- **WHEN** el horario está ocupado por una reserva `pendiente_pago` de 5 minutos
- **THEN** no se cancela nada y la clienta recibe "horario no disponible"

#### Scenario: Ocupado por una devuelta por rechazo
- **WHEN** el horario está ocupado por una reserva con motivo de rechazo, aunque tenga más de 20 minutos
- **THEN** no se cancela y la clienta recibe "horario no disponible"

#### Scenario: Varias vencidas en conflicto
- **WHEN** el turno nuevo se solapa con líneas de dos reservas vencidas distintas
- **THEN** ambas se cancelan y la nueva reserva se crea

#### Scenario: Vencida y vigente a la vez
- **WHEN** el turno nuevo se solapa con una línea vencida y con una vigente
- **THEN** no queda cancelada ninguna de las dos y la clienta recibe "horario no disponible"

#### Scenario: Reserva con varias líneas vencida
- **WHEN** la reserva vencida tiene varias líneas y una de ellas choca
- **THEN** se cancela la reserva completa y todas sus líneas quedan inactivas

#### Scenario: Todo o nada
- **WHEN** tras cancelar la vencida el insert de la nueva reserva falla por otro motivo
- **THEN** la transacción se deshace y la reserva vencida sigue sin cancelar

### Requirement: Carrera contra el ingreso del número de operación
La cancelación por vencimiento MUST NOT cancelar una reserva que recibió un número de operación antes de que la cancelación se confirme. Si el `UPDATE` condicionado no afecta filas, el sistema MUST NOT reintentar el insert y la clienta nueva MUST recibir "horario no disponible", sin dejar cambios a medias.

#### Scenario: Número ingresado justo antes
- **WHEN** la clienta original ingresa su número de operación mientras la otra intenta tomar el horario vencido
- **THEN** la reserva original no se cancela, conserva su línea activa y la otra recibe "horario no disponible"

#### Scenario: Cancelación primero
- **WHEN** la reserva vencida ya fue cancelada por vencimiento y la clienta original intenta ingresar su número
- **THEN** la reserva sigue cancelada con motivo `vencida` (el rechazo del ingreso, con su mensaje, es del ítem de pago)

#### Scenario: Sin número ingresado
- **WHEN** nadie tomó el horario y la clienta original aún no pagó
- **THEN** su reserva sigue en `pendiente_pago` y puede ingresar su número

### Requirement: Sin tope de reservas sin pagar
El vencimiento SHALL limitar solo el tiempo que una reserva sin pagar ocupa el horario, no su cantidad: el sistema MUST NOT limitar las reservas sin pagar por teléfono ni por contacto en esta versión.

#### Scenario: Varias reservas sin pagar de la misma persona
- **WHEN** la misma persona crea varias reservas sin pagar en horarios distintos
- **THEN** todas se crean
