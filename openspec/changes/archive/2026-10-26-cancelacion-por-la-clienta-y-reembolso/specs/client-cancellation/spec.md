## Purpose

Permitir que la clienta cancele su reserva sin escribirle al studio, con un plazo mínimo que el servidor hace cumplir y sin dejar la agenda ni el reembolso en estado incoherente.

## ADDED Requirements

### Requirement: Cancelación de la reserva completa desde el enlace
El sistema SHALL permitir cancelar, con solo el token del enlace, una reserva en `pendiente_pago`, `pendiente_validacion` o `confirmada`. La reserva pasa a `cancelada` con motivo `clienta` y todas sus líneas quedan inactivas. No existe cancelar a una integrante suelta de un grupo.

#### Scenario: Reserva individual confirmada
- **WHEN** la clienta cancela con 24 h o más de anticipación una reserva confirmada
- **THEN** la reserva queda cancelada con motivo `clienta` y su línea inactiva

#### Scenario: Reserva grupal
- **WHEN** la clienta cancela un grupo de tres integrantes
- **THEN** la reserva y las tres líneas se cancelan juntas, o ninguna

#### Scenario: Reserva ya cancelada por otro motivo
- **WHEN** se intenta cancelar una reserva cancelada por vencimiento o por el studio
- **THEN** la acción responde que ya estaba cancelada y no cambia nada

### Requirement: Plazo de 24 horas decidido por el servidor
El servidor SHALL rechazar la cancelación si faltan menos de 24 horas para el primer turno activo de la reserva, medido contra el reloj del servidor; exactamente 24 horas todavía se permite. La interfaz MUST deshabilitar el botón pasado el plazo, pero la decisión es del servidor.

#### Scenario: Justo en el límite
- **WHEN** faltan exactamente 24 h para el primer turno
- **THEN** la cancelación se acepta

#### Scenario: Plazo vencido
- **WHEN** faltan 23 h 59 min para el primer turno y se invoca la acción directamente
- **THEN** se rechaza, la reserva no cambia y sus líneas siguen activas

#### Scenario: Grupo con turnos a distintas horas
- **WHEN** el primer turno del grupo está a menos de 24 h aunque otros estén más lejos
- **THEN** la cancelación se rechaza

### Requirement: Liberación del horario
Al cancelar, el sistema SHALL liberar el horario: la disponibilidad pública MUST volver a ofrecer cada turno cancelado y otra clienta puede reservarlo de inmediato.

#### Scenario: Horario disponible de nuevo
- **WHEN** se cancela una reserva
- **THEN** la consulta de disponibilidad muestra libres sus horarios

### Requirement: Cancelación atómica, idempotente y segura ante carreras
La cancelación SHALL ser una sola operación atómica sobre reserva y líneas, condicionada al estado esperado. Repetirla (doble clic) MUST responder que ya está cancelada sin cambiar nada. Si el studio valida o rechaza el pago a la vez, el resultado final MUST ser coherente.

#### Scenario: Doble clic
- **WHEN** la acción se envía dos veces seguidas
- **THEN** la reserva queda cancelada una sola vez y ambas respuestas indican que está cancelada

#### Scenario: Validación simultánea
- **WHEN** el studio valida el pago mientras la clienta cancela
- **THEN** la reserva queda cancelada con reembolso `pendiente`, nunca confirmada con líneas inactivas

#### Scenario: Rechazo simultáneo
- **WHEN** el studio rechaza el pago mientras la clienta cancela
- **THEN** la reserva queda cancelada, con líneas inactivas y un reembolso coherente con su estado final

### Requirement: El enlace es la única credencial
La acción de cancelar SHALL aceptar solo un token válido y no requerir sesión. Un token inválido o desconocido MUST responder "no encontrada" sin revelar el motivo, y la respuesta MUST NOT exponer datos de contacto.

#### Scenario: Token inválido
- **WHEN** se invoca la acción con un token mal formado o inexistente
- **THEN** responde "no encontrada" y no modifica ninguna reserva
