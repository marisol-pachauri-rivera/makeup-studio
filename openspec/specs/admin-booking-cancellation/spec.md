# admin-booking-cancellation Specification

## Purpose

Permitir que el studio cancele cualquier reserva viva desde el panel, por ejemplo una abandonada, y que su horario vuelva a estar disponible.

## Requirements

### Requirement: Cancelar desde el panel
Cancelar una reserva que no esté `cancelada` SHALL dejarla `cancelada` con motivo `studio` y todas sus líneas inactivas, en una sola transacción, desde cualquiera de los otros tres estados. Cancelar una ya cancelada MUST NOT cambiar nada.

#### Scenario: Cancelar una abandonada
- **WHEN** se cancela una reserva en pendiente de pago
- **THEN** queda cancelada con motivo `studio`, sus líneas inactivas y su horario disponible para otras clientas

#### Scenario: Cancelar una reserva grupal
- **WHEN** se cancela una reserva de tres integrantes
- **THEN** las tres líneas quedan inactivas

#### Scenario: Ya cancelada
- **WHEN** se cancela dos veces la misma reserva
- **THEN** el segundo intento informa que ya estaba cancelada y no cambia el motivo

### Requirement: Reembolso al cancelar una confirmada
Al cancelar una reserva `confirmada`, el estado de reembolso SHALL quedar `pendiente`. Cancelar en cualquier otro estado MUST dejar el reembolso como estaba.

#### Scenario: Confirmada
- **WHEN** se cancela una reserva confirmada
- **THEN** su reembolso queda pendiente y se ve en la lista

#### Scenario: Sin pago validado
- **WHEN** se cancela una reserva en pendiente de pago
- **THEN** su reembolso sigue como "no aplica"

### Requirement: Confirmación antes de cancelar
El detalle SHALL pedir una confirmación explícita antes de enviar la cancelación, que no se puede deshacer, y la acción MUST rechazar una cancelación enviada sin ella.

#### Scenario: Sin confirmar
- **WHEN** la administradora pulsa cancelar
- **THEN** ve un aviso con el botón de confirmar y la reserva no cambia hasta confirmarlo

#### Scenario: Envío directo sin confirmación
- **WHEN** la acción recibe la cancelación sin la marca de confirmación
- **THEN** no cancela y devuelve un mensaje

### Requirement: Cancelación segura ante carreras
La cancelación SHALL ser un `UPDATE` condicionado a que la reserva siga sin cancelar. Si la clienta informa su número justo en ese instante, o el vencimiento cancela la reserva, MUST ganar exactamente una operación y el estado final MUST ser coherente.

#### Scenario: Cancelar y la clienta ingresa su número
- **WHEN** el studio cancela una reserva sin número mientras la clienta lo informa
- **THEN** queda cancelada o en validación, nunca con estado y número incoherentes

#### Scenario: Cancelar y vencimiento a la vez
- **WHEN** el studio cancela una reserva vencida mientras otra clienta toma su horario
- **THEN** la reserva queda cancelada una sola vez y el horario queda libre

### Requirement: Solo la administradora cancela
La acción de cancelar SHALL verificar la sesión antes que cualquier otra cosa y validar con Zod; sin sesión MUST NOT modificar nada.

#### Scenario: Sin sesión
- **WHEN** se invoca la cancelación sin sesión válida
- **THEN** falla y la reserva no cambia
