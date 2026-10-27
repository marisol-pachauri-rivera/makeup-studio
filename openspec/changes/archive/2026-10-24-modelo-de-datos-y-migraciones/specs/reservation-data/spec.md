# Spec Delta

## Purpose

Definir cómo se almacenan las reservas y sus líneas, con las garantías de unicidad y coherencia de estado que el flujo de pago manual necesita y que la base de datos hace cumplir.

## ADDED Requirements

### Requirement: Reserva con contacto y estado controlado
La base de datos SHALL almacenar cada reserva con nombre y teléfono de contacto obligatorios, monto total no negativo y un estado restringido a `pendiente_pago`, `pendiente_validacion`, `confirmada` o `cancelada`. El estado inicial MUST ser `pendiente_pago` y la fecha de creación MUST registrarse automáticamente.

#### Scenario: Reserva nueva con valores por defecto
- **WHEN** se inserta una reserva con nombre, teléfono y monto
- **THEN** queda en `pendiente_pago`, con reembolso `no_aplica`, sin número de operación y con fecha de creación

#### Scenario: Estado inválido
- **WHEN** se intenta guardar una reserva con un estado que no es uno de los cuatro permitidos
- **THEN** la base rechaza la operación

#### Scenario: Monto negativo
- **WHEN** se intenta guardar una reserva con monto total negativo
- **THEN** la base rechaza la operación

### Requirement: Token de acceso único y no adivinable
Cada reserva SHALL tener un token de acceso obligatorio, único entre todas las reservas y generado por la base cuando no se informa uno, con aleatoriedad suficiente para no poder adivinarse. El token MUST NOT derivarse de datos de la reserva ni de un contador.

#### Scenario: Token generado
- **WHEN** se inserta una reserva sin indicar token
- **THEN** la reserva recibe un token y dos reservas nunca comparten token

#### Scenario: Token repetido
- **WHEN** se intenta insertar una reserva con un token ya usado por otra
- **THEN** la base rechaza la operación

### Requirement: Número de operación único
El número de operación de una reserva SHALL ser opcional y, cuando exista, MUST ser único entre todas las reservas. Varias reservas sin número de operación MUST poder coexistir.

#### Scenario: Número ya usado
- **WHEN** se intenta asignar a una reserva un número de operación que ya tiene otra reserva
- **THEN** la base rechaza la operación y la reserva conserva su estado anterior

#### Scenario: Varias reservas sin número
- **WHEN** existen varias reservas con número de operación nulo
- **THEN** todas conviven sin error

#### Scenario: Número liberado tras un rechazo
- **WHEN** una reserva pone su número de operación en nulo y otra reserva lo registra después
- **THEN** la segunda operación se acepta

### Requirement: Coherencia entre estado y número de operación
Una reserva en `pendiente_pago` MUST NOT tener número de operación, y una reserva en `pendiente_validacion` o `confirmada` MUST tenerlo. Una reserva `cancelada` MAY tenerlo o no.

#### Scenario: Pendiente de pago con número
- **WHEN** se intenta guardar una reserva en `pendiente_pago` con número de operación
- **THEN** la base rechaza la operación

#### Scenario: Confirmada sin número
- **WHEN** se intenta pasar una reserva a `confirmada` sin número de operación
- **THEN** la base rechaza la operación

#### Scenario: Cancelada conserva el número
- **WHEN** una reserva confirmada se cancela conservando su número de operación
- **THEN** la base acepta la operación

### Requirement: Motivo de cancelación coherente con el estado
El motivo de cancelación SHALL estar restringido a `vencida`, `clienta` o `studio`. MUST existir si y solo si la reserva está `cancelada`.

#### Scenario: Cancelada sin motivo
- **WHEN** se intenta guardar una reserva `cancelada` sin motivo de cancelación
- **THEN** la base rechaza la operación

#### Scenario: Motivo en reserva no cancelada
- **WHEN** se intenta guardar una reserva `confirmada` con motivo de cancelación
- **THEN** la base rechaza la operación

### Requirement: Estado de reembolso controlado
El estado de reembolso SHALL estar restringido a `no_aplica`, `pendiente` o `realizado`, con `no_aplica` por defecto.

#### Scenario: Reembolso inválido
- **WHEN** se intenta guardar un estado de reembolso fuera de los tres permitidos
- **THEN** la base rechaza la operación

### Requirement: Líneas de reserva con precio copiado
Cada línea de reserva SHALL pertenecer a una reserva y registrar el nombre de la persona, el servicio, la maquilladora, el inicio y el fin del turno, el precio del servicio al reservar y un indicador `activa`, verdadero por defecto. El fin MUST ser posterior al inicio y el precio MUST NOT ser negativo. El precio de la línea MUST NOT cambiar cuando cambia el precio del servicio.

#### Scenario: Línea válida
- **WHEN** se inserta una línea con fin posterior al inicio para una reserva, servicio y maquilladora existentes
- **THEN** la línea queda guardada y activa

#### Scenario: Turno con fin anterior al inicio
- **WHEN** se intenta guardar una línea cuyo fin no es posterior a su inicio
- **THEN** la base rechaza la operación

#### Scenario: Cambio de precio del catálogo
- **WHEN** se actualiza el precio de un servicio que ya tiene líneas
- **THEN** el precio guardado en esas líneas no cambia

### Requirement: Una reserva con varias líneas
Una reserva SHALL poder tener una o más líneas, una por persona en una reserva grupal.

#### Scenario: Reserva grupal
- **WHEN** se insertan tres líneas para la misma reserva en horarios que no se solapan
- **THEN** las tres líneas quedan asociadas a esa reserva
