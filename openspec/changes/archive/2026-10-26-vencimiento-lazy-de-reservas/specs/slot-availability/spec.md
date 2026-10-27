## MODIFIED Requirements

### Requirement: Bloqueos y reservas ocupan el horario
Un horario MUST NOT ofrecerse si el turno completo se solapa con un bloqueo de agenda de esa maquilladora o con una línea de reserva activa de esa maquilladora. Los rangos se tratan como semiabiertos: un turno que empieza justo cuando termina un bloqueo o una reserva, o que termina justo cuando empieza, MUST ofrecerse. Las líneas inactivas MUST NOT ocupar horario, y tampoco las líneas activas de una reserva vencida (en `pendiente_pago`, sin número de operación, sin motivo de rechazo y con más de 20 minutos desde su creación), que MUST tratarse como libres. Una reserva `pendiente_pago` no vencida, o devuelta a `pendiente_pago` por un rechazo, MUST seguir ocupando. Las reservas y bloqueos de otras maquilladoras MUST NOT afectar a esta.

#### Scenario: Bloqueo en medio del día
- **WHEN** hay un bloqueo de 10:00 a 12:00 y el servicio dura 60 minutos en un tramo de 09:00 a 14:00
- **THEN** se ofrecen 09:00, 12:00, 12:30 y 13:00, y no 09:30, 10:00, 10:30, 11:00 ni 11:30

#### Scenario: Bloqueo de varios días
- **WHEN** hay un bloqueo desde el 24/12 a las 14:00 hasta el 26/12 a las 09:00
- **THEN** el 25/12 no ofrece horarios y el 24/12 no ofrece ninguno que se cruce con el bloqueo

#### Scenario: Reserva activa
- **WHEN** existe una línea activa de 10:00 a 11:00 para esa maquilladora
- **THEN** no se ofrece ningún horario cuyo turno se cruce con ese rango

#### Scenario: Turnos contiguos
- **WHEN** existe una línea activa de 10:00 a 11:00 y el servicio dura 60 minutos
- **THEN** se ofrecen 09:00 (termina a las 10:00) y 11:00 (empieza a las 11:00)

#### Scenario: Línea inactiva
- **WHEN** una reserva fue cancelada y su línea quedó inactiva
- **THEN** su horario vuelve a ofrecerse

#### Scenario: Otra maquilladora
- **WHEN** otra maquilladora tiene una reserva de 10:00 a 11:00
- **THEN** ese horario sigue libre para la maquilladora consultada

#### Scenario: Reserva pendiente de pago
- **WHEN** una reserva en pendiente de pago creada hace menos de 20 minutos tiene su línea activa en ese horario
- **THEN** el horario no se ofrece, porque la reserva pendiente ocupa agenda

#### Scenario: Reserva pendiente de pago vencida
- **WHEN** una reserva en pendiente de pago sin número de operación ni motivo de rechazo tiene más de 20 minutos y su línea sigue activa
- **THEN** el horario se ofrece como libre

#### Scenario: Reserva devuelta por rechazo
- **WHEN** una reserva volvió a pendiente de pago con motivo de rechazo y tiene más de 20 minutos
- **THEN** su horario no se ofrece

#### Scenario: Reserva en validación o confirmada
- **WHEN** una reserva en pendiente de validación o confirmada tiene más de 20 minutos
- **THEN** su horario no se ofrece
