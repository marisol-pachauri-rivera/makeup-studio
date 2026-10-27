# booking-status-page Delta

## ADDED Requirements

### Requirement: Motivo del rechazo del pago visible
La página de una reserva en `pendiente_pago` devuelta por un rechazo SHALL mostrar el motivo que dio el studio junto al formulario del número de operación y explicar que puede ingresar uno nuevo. Si no hubo rechazo MUST NOT mostrar ningún motivo; y al informar un número nuevo el motivo MUST desaparecer.

#### Scenario: Reserva rechazada
- **WHEN** la clienta abre el enlace de una reserva rechazada con el motivo "número mal escrito"
- **THEN** ve ese motivo junto al campo del número y la invitación a ingresar uno nuevo

#### Scenario: Sin rechazo
- **WHEN** abre el enlace de una reserva pendiente de pago que nunca fue rechazada
- **THEN** no ve ningún motivo de rechazo

#### Scenario: Número nuevo
- **WHEN** la clienta informa un número nuevo tras el rechazo
- **THEN** la página pasa a pendiente de validación y ya no muestra el motivo

#### Scenario: Sin plazo de 20 minutos
- **WHEN** la reserva fue devuelta por un rechazo
- **THEN** no muestra el plazo de 20 minutos, porque no vence
