## MODIFIED Requirements

### Requirement: Choque de horario entre dos clientas
Si dos clientas confirman el mismo horario con la misma maquilladora casi al mismo tiempo, el sistema SHALL crear exactamente una reserva y responder "horario ya no disponible" a la otra, sin dejar datos a medias. La base MUST seguir siendo la garantía final: tanto el rechazo por exclusión como el abortado por bloqueo mutuo que Postgres pueda devolver al perdedor MUST traducirse al mismo mensaje. Si el horario lo ocupa una reserva vencida, la nueva reserva MUST quedarse con él cancelando la vencida en la misma transacción; si esa cancelación no procede porque la reserva dejó de estar vencida, la clienta MUST recibir "horario ya no disponible".

#### Scenario: Dos envíos simultáneos
- **WHEN** dos clientas distintas confirman el mismo horario a la vez
- **THEN** una reserva se crea y la otra recibe "horario ya no disponible"

#### Scenario: Perdedor sin datos a medias
- **WHEN** una clienta pierde el choque
- **THEN** no existe ninguna reserva ni línea a su nombre

#### Scenario: Bloqueo mutuo de Postgres
- **WHEN** la base aborta al perdedor con un bloqueo mutuo en vez de un rechazo por exclusión
- **THEN** la clienta recibe el mismo mensaje de horario ya no disponible, no un error técnico

#### Scenario: Horario de una reserva vencida
- **WHEN** una clienta confirma un horario que ocupa una reserva vencida
- **THEN** su reserva se crea y la vencida queda cancelada con motivo `vencida`

#### Scenario: Dos clientas por el horario de una vencida
- **WHEN** dos clientas confirman a la vez el horario de una reserva vencida
- **THEN** una reserva se crea, la otra recibe "horario ya no disponible" y la vencida queda cancelada una sola vez

#### Scenario: La vencida dejó de estarlo
- **WHEN** la clienta original ingresa su número de operación justo mientras otra intenta tomar el horario
- **THEN** la reserva original se conserva y la otra recibe "horario ya no disponible"
