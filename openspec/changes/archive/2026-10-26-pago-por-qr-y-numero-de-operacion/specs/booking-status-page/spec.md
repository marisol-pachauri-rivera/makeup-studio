## MODIFIED Requirements

### Requirement: Cada estado se explica con palabras
La página SHALL mostrar el estado de la reserva con un texto claro para cada uno de sus cuatro estados: pendiente de pago, pendiente de validación, confirmada y cancelada. Una reserva pendiente de pago MUST ofrecer cómo pagar. Una reserva cancelada por vencimiento MUST explicar que venció y ofrecer elegir otro horario. El estado MUST NOT depender solo del color.

#### Scenario: Pendiente de pago
- **WHEN** la reserva está pendiente de pago
- **THEN** la página explica que el horario está apartado, que falta completar el pago y ofrece pagar

#### Scenario: Pendiente de validación
- **WHEN** la reserva está pendiente de validación
- **THEN** la página explica que el studio está revisando el pago

#### Scenario: Confirmada
- **WHEN** el studio validó el pago
- **THEN** la página indica que la reserva está confirmada

#### Scenario: Cancelada
- **WHEN** la reserva está cancelada
- **THEN** la página indica que fue cancelada

#### Scenario: Cancelada por vencimiento
- **WHEN** la reserva fue cancelada porque pasaron 20 minutos sin pago y otra clienta tomó el horario
- **THEN** la página explica que venció y ofrece un enlace para elegir otro horario
