## ADDED Requirements

### Requirement: Control de cancelación y plazo visible
La página SHALL ofrecer "Cancelar reserva" a la reserva en `pendiente_pago`, `pendiente_validacion` o `confirmada`, pidiendo confirmación antes de cancelar, y MUST mostrar hasta cuándo se puede cancelar en hora de Lima. Pasado el plazo de 24 h deshabilita el botón y dice que escriba al studio.

#### Scenario: Dentro del plazo
- **WHEN** la clienta abre su reserva confirmada con más de 24 h de anticipación
- **THEN** ve el botón activo y la fecha límite en hora de Lima

#### Scenario: Plazo vencido
- **WHEN** faltan menos de 24 h para el primer turno
- **THEN** el botón está deshabilitado y la página indica que escriba al studio

#### Scenario: Confirmación
- **WHEN** la clienta pulsa "Cancelar reserva"
- **THEN** se le pide confirmar antes de enviar la cancelación

### Requirement: Explicación del reembolso a la clienta
La página SHALL, en una reserva cancelada por la clienta con reembolso, mostrar el monto, que el studio lo gestiona y su estado (`pendiente` o `realizado`), sin prometer plazos. Sin reembolso (`no_aplica`) MUST decir que no hay pago que devolver.

#### Scenario: Reembolso pendiente
- **WHEN** abre una reserva que ella canceló con reembolso pendiente
- **THEN** ve el monto, que el studio gestionará la devolución y que está pendiente

#### Scenario: Reembolso realizado
- **WHEN** el studio marcó el reembolso como realizado
- **THEN** la página indica que fue realizado

#### Scenario: Sin pago
- **WHEN** abre una reserva que canceló sin haber informado pago
- **THEN** la página indica que no hay pago que devolver
