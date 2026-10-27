# payment-validation Specification

## Purpose

Permitir que el studio confirme el pago de una reserva tras cotejar el número de operación con su billetera, o lo devuelva con un motivo para que la clienta lo corrija sin perder su horario.

## ADDED Requirements

### Requirement: Validar el pago
Validar una reserva en `pendiente_validacion` SHALL dejarla `confirmada` y guardar el instante en `validada_en`, sin tocar el número de operación ni las líneas. Si la reserva ya no está en `pendiente_validacion`, la acción MUST NOT cambiar nada y MUST decir cuál es su estado actual.

#### Scenario: Validación exitosa
- **WHEN** la administradora valida una reserva en validación
- **THEN** queda confirmada con `validada_en` y la página de estado de la clienta lo refleja al recargar

#### Scenario: Repetir la validación
- **WHEN** se valida una reserva que ya está confirmada
- **THEN** no cambia nada y se informa que ya estaba confirmada

#### Scenario: Reserva que cambió de estado
- **WHEN** se valida una reserva que otra persona canceló un instante antes
- **THEN** sigue cancelada y se informa que ya no está en validación

### Requirement: Rechazar el pago con motivo
Rechazar una reserva en `pendiente_validacion` SHALL, en una sola operación, devolverla a `pendiente_pago`, poner en nulo el número de operación, guardar el motivo y dejar sus líneas activas. El motivo MUST ser obligatorio, recortado y de hasta 300 caracteres.

#### Scenario: Rechazo exitoso
- **WHEN** se rechaza una reserva con el motivo "no coincide con ningún movimiento"
- **THEN** vuelve a pendiente de pago, sin número, con ese motivo y con su horario aún ocupado

#### Scenario: Motivo vacío
- **WHEN** se intenta rechazar con el motivo vacío o solo espacios
- **THEN** no cambia nada y el error aparece junto al campo conservando lo escrito

#### Scenario: Motivo demasiado largo
- **WHEN** el motivo supera 300 caracteres
- **THEN** se rechaza la entrada con un mensaje y la reserva no cambia

### Requirement: El número rechazado queda libre
Tras un rechazo, el número de operación anterior SHALL poder usarse en otra reserva, y la clienta MUST poder informar uno nuevo desde su página de estado, con lo que la reserva vuelve a `pendiente_validacion` y el motivo se limpia.

#### Scenario: Número reutilizable
- **WHEN** se rechaza la reserva con el número "OP-1"
- **THEN** otra reserva puede registrar "OP-1"

#### Scenario: La clienta corrige
- **WHEN** la clienta informa un número nuevo tras el rechazo
- **THEN** la reserva queda en validación y sin motivo de rechazo

### Requirement: La reserva rechazada no vence
Una reserva devuelta por un rechazo SHALL conservar su horario sin límite de tiempo hasta que la clienta informe un número o el studio la cancele. Validar y rechazar MUST NOT tener plazo máximo.

#### Scenario: Rechazada y olvidada
- **WHEN** pasan varios días desde el rechazo sin que la clienta responda
- **THEN** la reserva sigue en pendiente de pago y otra clienta no puede tomar su horario

#### Scenario: Validación tardía
- **WHEN** una reserva lleva varios días en validación
- **THEN** la administradora todavía puede validarla o rechazarla

### Requirement: Transiciones seguras ante carreras
Cada transición SHALL ejecutarse como un `UPDATE` condicionado al estado esperado, de modo que ante dos operaciones simultáneas sobre la misma reserva gane exactamente una y el estado final sea coherente. Validar y rechazar a la vez MUST dejar una sola de las dos aplicada.

#### Scenario: Validar y rechazar a la vez
- **WHEN** dos administradoras validan y rechazan la misma reserva al mismo tiempo
- **THEN** una acción se aplica y la otra informa que el estado cambió; la reserva queda confirmada o devuelta, nunca mezclada

#### Scenario: Doble clic en validar
- **WHEN** se envía dos veces la validación de la misma reserva
- **THEN** la reserva queda confirmada una vez y `validada_en` no se pisa

### Requirement: Solo la administradora actúa
Validar y rechazar SHALL verificar la sesión de administradora antes que cualquier otra cosa y MUST validar sus entradas con Zod; una invocación directa sin sesión o con un identificador inválido MUST NOT modificar nada.

#### Scenario: Invocación sin sesión
- **WHEN** se invoca la acción de validar sin sesión válida
- **THEN** falla sin tocar la base

#### Scenario: Identificador manipulado
- **WHEN** la acción recibe un identificador no numérico o ausente
- **THEN** responde "no encontrada" sin modificar ninguna reserva
