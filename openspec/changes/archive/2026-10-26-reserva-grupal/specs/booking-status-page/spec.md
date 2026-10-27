## MODIFIED Requirements

### Requirement: Página de estado por enlace con token
El sistema SHALL ofrecer una página `/reservas/<token>` que, sin requerir sesión, muestre la reserva identificada por ese token: su estado, el servicio, la maquilladora, el día y la hora en hora de Lima de cada uno de sus turnos, y el monto total. En una reserva grupal MUST mostrar un turno por integrante, con el nombre de la integrante, y el monto total del grupo. La página MUST ser de solo lectura en esta versión.

#### Scenario: Reserva recién creada
- **WHEN** la clienta abre el enlace de su reserva recién creada
- **THEN** ve el servicio, la maquilladora, el día y la hora, el monto y el estado pendiente de pago

#### Scenario: Monto exacto
- **WHEN** la reserva se hizo por 350.50
- **THEN** la página muestra 350.50 sin redondeos

#### Scenario: Sin cuenta
- **WHEN** alguien sin sesión abre un enlace válido
- **THEN** ve la reserva y no es llevado a ningún inicio de sesión

#### Scenario: Reserva grupal
- **WHEN** la clienta abre el enlace de un grupo de tres integrantes
- **THEN** ve tres turnos, cada uno con el nombre de la integrante, su servicio, su maquilladora, el día y la hora, y un único estado y monto total del grupo

#### Scenario: Integrantes con el mismo nombre
- **WHEN** dos integrantes del grupo tienen el mismo nombre y el mismo horario con maquilladoras distintas
- **THEN** la página muestra ambos turnos, sin ocultar ni duplicar ninguno

#### Scenario: Orden de los turnos
- **WHEN** el grupo tiene turnos a distintas horas
- **THEN** se muestran ordenados por hora de inicio
