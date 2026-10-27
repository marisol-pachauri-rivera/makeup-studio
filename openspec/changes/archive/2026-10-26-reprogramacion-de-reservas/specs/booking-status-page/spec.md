## ADDED Requirements

### Requirement: Reprogramar un turno desde la página de estado
La página de estado SHALL ofrecer "Reprogramar" en cada turno activo de una reserva confirmada, que lleva a reprogramar ese turno. Con menos de 24 horas para el turno, la acción MUST mostrarse deshabilitada con la explicación del plazo. En otro estado de la reserva MUST NOT ofrecerse.

#### Scenario: Turno reprogramable
- **WHEN** la reserva está confirmada y el turno está a más de 24 horas
- **THEN** el turno muestra un acceso para reprogramarlo

#### Scenario: Plazo vencido
- **WHEN** faltan menos de 24 horas para el turno
- **THEN** el acceso aparece deshabilitado y explica que ya no se puede reprogramar

#### Scenario: Reserva grupal
- **WHEN** la reserva es de un grupo de tres integrantes
- **THEN** cada turno tiene su propio acceso para reprogramar

#### Scenario: Reserva no confirmada
- **WHEN** la reserva está pendiente de pago, en validación o cancelada
- **THEN** no se ofrece reprogramar
