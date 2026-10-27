## ADDED Requirements

### Requirement: Reprogramar libera una reserva vencida en el destino
Cuando el nuevo horario de una reprogramación choca solo con líneas de reservas vencidas, el sistema SHALL cancelarlas (motivo `vencida`, todas sus líneas inactivas) y completar el movimiento en la misma transacción. El propio turno que se mueve MUST NOT contar como bloqueante. Si algo vigente ocupa el destino, no se cancela nada y el turno original queda intacto.

#### Scenario: Destino ocupado por una vencida
- **WHEN** el destino lo ocupa una reserva vencida
- **THEN** esa reserva queda cancelada por vencimiento y el turno queda en el nuevo horario

#### Scenario: Destino ocupado por una vigente
- **WHEN** el destino lo ocupa una reserva vigente, o una vencida junto con una vigente
- **THEN** no se cancela ninguna y el turno original no cambia

#### Scenario: Se cruza con su propio turno y una vencida
- **WHEN** el destino se solapa con una vencida y con el horario original del mismo turno
- **THEN** la vencida se libera y el movimiento se completa

#### Scenario: Número ingresado justo antes
- **WHEN** la reserva vencida recibe su número de operación mientras se reprograma sobre su horario
- **THEN** no se cancela y la reprogramación se rechaza con "horario ya no disponible"
