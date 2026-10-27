## Purpose

Darle a la clienta un lugar propio, accesible solo con su enlace, donde ver el estado de su reserva sin necesidad de cuenta ni de escribirle al studio.

## ADDED Requirements

### Requirement: Página de estado por enlace con token
El sistema SHALL ofrecer una página `/reservas/<token>` que, sin requerir sesión, muestre la reserva identificada por ese token: su estado, el servicio, la maquilladora, el día y la hora en hora de Lima, y el monto total. La página MUST ser de solo lectura en esta versión.

#### Scenario: Reserva recién creada
- **WHEN** la clienta abre el enlace de su reserva recién creada
- **THEN** ve el servicio, la maquilladora, el día y la hora, el monto y el estado pendiente de pago

#### Scenario: Monto exacto
- **WHEN** la reserva se hizo por 350.50
- **THEN** la página muestra 350.50 sin redondeos

#### Scenario: Sin cuenta
- **WHEN** alguien sin sesión abre un enlace válido
- **THEN** ve la reserva y no es llevado a ningún inicio de sesión

### Requirement: Cada estado se explica con palabras
La página SHALL mostrar el estado de la reserva con un texto claro para cada uno de sus cuatro estados: pendiente de pago, pendiente de validación, confirmada y cancelada. El estado MUST NOT depender solo del color.

#### Scenario: Pendiente de pago
- **WHEN** la reserva está pendiente de pago
- **THEN** la página explica que el horario está apartado y que falta completar el pago

#### Scenario: Pendiente de validación
- **WHEN** la reserva está pendiente de validación
- **THEN** la página explica que el studio está revisando el pago

#### Scenario: Confirmada
- **WHEN** el studio validó el pago
- **THEN** la página indica que la reserva está confirmada

#### Scenario: Cancelada
- **WHEN** la reserva está cancelada
- **THEN** la página indica que fue cancelada

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
