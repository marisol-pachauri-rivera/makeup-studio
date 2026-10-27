# booking-status-page Specification

## Purpose

Darle a la clienta un lugar propio, accesible solo con su enlace, donde ver el estado de su reserva sin necesidad de cuenta ni de escribirle al studio.

## Requirements

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

### Requirement: Token inválido o inexistente
Un token que no tiene el formato esperado o que no corresponde a ninguna reserva SHALL responder "no encontrado" sin revelar si el formato era el problema ni mostrar datos de ninguna reserva.

#### Scenario: Token con formato inválido
- **WHEN** se abre `/reservas/abc`
- **THEN** se responde "no encontrado"

#### Scenario: Token desconocido
- **WHEN** se abre un token con formato válido que no existe
- **THEN** se responde "no encontrado", igual que con el formato inválido

### Requirement: El enlace es la única credencial y se protege
Las páginas que llevan o muestran el token SHALL indicarle a buscadores y cachés que no las indexen ni las guarden, y MUST NOT enviar el enlace como referencia a otros sitios. La página MUST NOT mostrar el teléfono de contacto ni datos de otras clientas, y MUST avisar a la clienta que guarde el enlace porque es la única forma de volver a su reserva.

#### Scenario: Cabeceras de protección
- **WHEN** se pide una página de estado
- **THEN** la respuesta indica que no debe indexarse ni guardarse en cachés compartidas y que no se envíe el enlace como referencia

#### Scenario: Sin teléfono
- **WHEN** se muestra la página de estado
- **THEN** no aparece el teléfono de contacto

#### Scenario: Aviso de guardar el enlace
- **WHEN** la clienta ve su reserva
- **THEN** la página le recuerda que guarde el enlace

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
