## Purpose

Permitir que la clienta pague su reserva por la billetera electrónica del studio y avise del pago con el número de operación, sin subir archivos, dejando la reserva lista para que el studio la valide.

## ADDED Requirements

### Requirement: Sección de pago para una reserva pendiente de pago
La página de estado de una reserva en `pendiente_pago` SHALL mostrar el QR de la billetera del studio, el nombre de la billetera, el monto total exacto a pagar y un campo para ingresar el número de operación. La sección MUST NOT permitir subir archivos. Las reservas en cualquier otro estado MUST NOT mostrar la sección de pago.

#### Scenario: Reserva pendiente de pago
- **WHEN** la clienta abre el enlace de una reserva pendiente de pago
- **THEN** ve el QR, el nombre de la billetera, el monto exacto y un campo para el número de operación

#### Scenario: Monto de un grupo
- **WHEN** la reserva es un grupo cuyo total es 550.60
- **THEN** la sección de pago muestra 550.60 como monto a pagar

#### Scenario: Sin subida de archivos
- **WHEN** se muestra la sección de pago
- **THEN** no hay ningún campo para adjuntar archivos

#### Scenario: Otros estados
- **WHEN** la reserva está pendiente de validación, confirmada o cancelada
- **THEN** la página no muestra el QR ni el campo para ingresar un número

### Requirement: QR configurado por el studio
El QR y el nombre de la billetera SHALL salir de la configuración del studio. Si el QR no está configurado, la sección de pago MUST decir que el pago por QR todavía no está disponible y MUST NOT ofrecer el campo del número, para que nadie pague sin saber a dónde.

#### Scenario: QR configurado
- **WHEN** el studio configuró la imagen del QR y el nombre de su billetera
- **THEN** la sección de pago los muestra

#### Scenario: Sin QR configurado
- **WHEN** el QR no está configurado
- **THEN** la sección indica que el pago por QR todavía no está disponible y no ofrece el campo

#### Scenario: Imagen con texto alternativo
- **WHEN** se muestra el QR
- **THEN** la imagen tiene un texto alternativo que dice a qué billetera corresponde

### Requirement: Plazo de pago visible
Para una reserva en `pendiente_pago` que puede vencer (sin motivo de rechazo), la sección de pago SHALL mostrar el plazo de 20 minutos y hasta qué hora de Lima tiene para pagar. Una reserva devuelta por un rechazo de pago MUST NOT mostrar plazo. Si el plazo ya pasó y la reserva no fue cancelada, la sección MUST avisar que el horario podría haberse liberado y que, si nadie lo tomó, todavía puede ingresar su número.

#### Scenario: Dentro del plazo
- **WHEN** la reserva se creó hace 5 minutos
- **THEN** la sección dice que tiene 20 minutos desde que reservó y hasta qué hora de Lima

#### Scenario: Plazo pasado sin cancelar
- **WHEN** pasaron 25 minutos y la reserva sigue en pendiente de pago
- **THEN** la sección avisa que el plazo pasó, que el horario podría haberse liberado y que aún puede ingresar su número si nadie lo tomó

#### Scenario: Devuelta por un rechazo
- **WHEN** la reserva volvió a pendiente de pago por un rechazo del pago
- **THEN** la sección no muestra ningún plazo

### Requirement: Ingreso del número de operación
Al enviar un número de operación válido, el sistema SHALL guardar el número en la reserva y pasarla a `pendiente_validacion` en una sola operación condicionada a que siga en `pendiente_pago` y sin número. El número MUST normalizarse (espacios sobrantes recortados y mayúsculas) y tener entre 4 y 30 caracteres, letras o números y guiones, sin espacios interiores. La acción MUST validar la entrada en el servidor y MUST NOT requerir sesión.

#### Scenario: Número válido
- **WHEN** la clienta envía el número "op-123456" para su reserva pendiente de pago
- **THEN** la reserva queda en pendiente de validación con el número OP-123456

#### Scenario: Normalización
- **WHEN** envía " ab12cd34 " con espacios alrededor y en minúsculas
- **THEN** se guarda como AB12CD34

#### Scenario: Después de un rechazo
- **WHEN** la reserva volvió a pendiente de pago por un rechazo con motivo y la clienta envía un número nuevo
- **THEN** la reserva pasa a pendiente de validación con ese número y el motivo del rechazo se limpia

#### Scenario: Número vacío
- **WHEN** envía el campo vacío o solo con espacios
- **THEN** no se modifica la reserva, que sigue pendiente de pago, y se muestra un error en el campo

#### Scenario: Formato inválido
- **WHEN** el número tiene espacios interiores, símbolos o menos de 4 caracteres
- **THEN** se rechaza con un mensaje claro y la reserva no cambia

#### Scenario: Token inválido
- **WHEN** la acción recibe un token que no es válido o no corresponde a ninguna reserva
- **THEN** se rechaza como reserva no encontrada, sin revelar si el formato era el problema

### Requirement: Número de operación único
Un número de operación ya usado en otra reserva SHALL rechazarse con un mensaje claro y MUST NOT cambiar el estado de la reserva. La comparación MUST ser sobre el número normalizado.

#### Scenario: Número ya usado
- **WHEN** la clienta envía un número que ya tiene otra reserva
- **THEN** se rechaza con un mensaje que lo explica y su reserva sigue pendiente de pago

#### Scenario: Mismo número con otras mayúsculas
- **WHEN** otra reserva tiene OP-1 y la clienta envía "op-1"
- **THEN** se rechaza como número ya usado

#### Scenario: Dos reservas con el mismo número a la vez
- **WHEN** dos reservas distintas envían el mismo número casi al mismo tiempo
- **THEN** una pasa a pendiente de validación y la otra recibe el mensaje de número ya usado

### Requirement: Reenvío del mismo número
Reenviar el mismo número a una reserva que ya lo tiene SHALL tratarse como un éxito sin cambiar nada. Enviar un número distinto a una reserva que ya tiene uno MUST rechazarse explicando que el pago ya fue informado.

#### Scenario: Doble clic
- **WHEN** la clienta envía dos veces seguidas el mismo número
- **THEN** ambos envíos responden éxito y la reserva queda con un solo número en pendiente de validación

#### Scenario: Otro número después de informar el pago
- **WHEN** la reserva ya está en pendiente de validación y la clienta envía otro número
- **THEN** se rechaza explicando que el pago ya fue informado y que el studio lo está revisando, y el número guardado no cambia

#### Scenario: Reserva confirmada
- **WHEN** la reserva ya está confirmada y se envía un número
- **THEN** se rechaza explicando que la reserva ya está confirmada

### Requirement: Reserva vencida
Si la reserva fue cancelada por vencimiento, el ingreso del número SHALL rechazarse con un mensaje que explica que venció y que debe elegir otro horario, sin modificarla. Una reserva con el plazo pasado que nadie canceló MUST aceptar el número. Una reserva cancelada por cualquier otro motivo MUST rechazarse indicando que fue cancelada.

#### Scenario: Cancelada por vencimiento
- **WHEN** la clienta envía su número y su reserva ya fue cancelada por vencimiento
- **THEN** se rechaza con un mensaje que explica que venció y ofrece elegir otro horario, y la reserva sigue cancelada

#### Scenario: Plazo pasado pero nadie tomó el horario
- **WHEN** la reserva tiene más de 20 minutos, sigue en pendiente de pago y la clienta envía su número
- **THEN** el número se acepta y la reserva pasa a pendiente de validación

#### Scenario: Cancelada por otro motivo
- **WHEN** la reserva fue cancelada por el studio o por la clienta y se envía un número
- **THEN** se rechaza indicando que fue cancelada, sin modificarla

### Requirement: Carrera contra el vencimiento
Si el número de operación y la cancelación por vencimiento de la misma reserva ocurren a la vez, SHALL ganar exactamente uno y la reserva MUST quedar en un estado coherente: o con el número en pendiente de validación y su horario conservado, o cancelada por vencimiento con el ingreso rechazado.

#### Scenario: Gana el ingreso del número
- **WHEN** otra clienta intenta tomar el horario de una reserva vencida mientras su dueña envía el número
- **THEN** si el número se confirma primero, la reserva se conserva con su horario y la otra clienta recibe horario no disponible

#### Scenario: Gana la cancelación
- **WHEN** la cancelación por vencimiento se confirma primero
- **THEN** el ingreso del número se rechaza como reserva vencida y la reserva sigue cancelada
