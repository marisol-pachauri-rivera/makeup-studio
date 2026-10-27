## Purpose

Permitir que la clienta cambie el horario y la maquilladora de un turno de su reserva confirmada desde su enlace, con 24 horas de anticipación y sin volver a pagar, sin arriesgar nunca su turno original.

## ADDED Requirements

### Requirement: Qué turnos se pueden reprogramar
El sistema SHALL permitir reprogramar un turno solo si su reserva está `confirmada` y el turno está activo. Una reserva en otro estado MUST rechazar la reprogramación sin cambiar nada, y el servidor MUST exigir que el turno pertenezca a la reserva del token.

#### Scenario: Reserva confirmada
- **WHEN** la clienta reprograma un turno activo de su reserva confirmada
- **THEN** la operación se evalúa y puede aplicarse

#### Scenario: Reserva no confirmada
- **WHEN** la reserva está pendiente de pago, pendiente de validación o cancelada
- **THEN** la reprogramación se rechaza y el turno no cambia

#### Scenario: Turno de otra reserva
- **WHEN** se envía el identificador de un turno que no es de la reserva del token
- **THEN** se responde "no encontrado" y no cambia nada

### Requirement: Plazo mínimo de 24 horas
El sistema SHALL permitir reprogramar solo si faltan 24 horas o más para el inicio del turno original, calculado en el servidor con su reloj. Con menos de 24 horas el servidor MUST rechazarlo aunque la pantalla se haya enviado.

#### Scenario: Con 24 horas exactas
- **WHEN** faltan exactamente 24 horas para el turno
- **THEN** se permite reprogramar

#### Scenario: Con menos de 24 horas
- **WHEN** faltan 23 horas y 59 minutos
- **THEN** el servidor lo rechaza con un mensaje que explica el plazo y el turno no cambia

#### Scenario: Plazo vencido tras abrir la pantalla
- **WHEN** la clienta abrió la pantalla con tiempo y confirma cuando ya faltan menos de 24 horas
- **THEN** el servidor lo rechaza

### Requirement: Elegir el nuevo horario
La pantalla SHALL ofrecer cualquier maquilladora activa, sin asignar ninguna, y los horarios libres para la misma duración del turno actual con las reglas de disponibilidad pública. El servicio MUST NOT poder cambiarse. El propio turno MUST NOT contar como ocupado. La selección MUST vivir en la URL y no guardar nada en el servidor hasta confirmar.

#### Scenario: Cambiar de maquilladora
- **WHEN** la clienta elige otra maquilladora y un horario libre
- **THEN** ve un resumen con el turno actual y el nuevo, y un botón para confirmar

#### Scenario: Desplazarse sobre el propio horario
- **WHEN** el turno es de 10:00 a 11:00 y mira los horarios de la misma maquilladora
- **THEN** se ofrece 10:30, que solo se cruza con su propio turno

#### Scenario: Elegir no reserva
- **WHEN** elige un horario y no confirma
- **THEN** su turno original sigue igual y el horario nuevo sigue libre para otras

### Requirement: La reprogramación conserva pago, estado y monto
Al reprogramar, el sistema SHALL actualizar solo inicio, fin y maquilladora del turno, en una transacción. La reserva MUST conservar estado, número de operación, monto total y precio del turno, y MUST NOT pedir un nuevo pago. El fin MUST ser el nuevo inicio más la duración original del turno.

#### Scenario: Reprogramación exitosa
- **WHEN** la clienta confirma un horario libre
- **THEN** el turno queda con el nuevo inicio, fin y maquilladora y la reserva sigue confirmada con el mismo número y monto

#### Scenario: Otras integrantes intactas
- **WHEN** se reprograma un turno de una reserva grupal
- **THEN** los demás turnos no cambian y el monto total es el mismo

#### Scenario: Vuelta a la página de estado
- **WHEN** la reprogramación se confirma
- **THEN** la clienta llega a su página de estado y ve el turno nuevo

### Requirement: Un horario ocupado no hace perder el turno original
Si el nuevo horario ya no está disponible, el sistema SHALL rechazar con "horario ya no disponible" y dejar el turno original intacto. La pantalla MUST conservar maquilladora y día elegidos y permitir elegir otro horario. Un choque de exclusión (`23P01`) o un bloqueo mutuo (`40P01`) MUST tratarse igual.

#### Scenario: Horario tomado
- **WHEN** otra clienta tiene vigente ese horario con esa maquilladora
- **THEN** la clienta ve que ya no está disponible, su turno original sigue activo y puede elegir otro

#### Scenario: Dos reprogramaciones al mismo horario
- **WHEN** dos clientas piden a la vez el mismo horario libre
- **THEN** una lo obtiene y la otra recibe "horario ya no disponible" con su turno intacto

#### Scenario: Bloqueo de agenda
- **WHEN** el horario cae en un bloqueo de agenda o fuera del horario de trabajo
- **THEN** se rechaza y el turno no cambia

### Requirement: Idempotencia ante doble clic y pantalla desactualizada
La operación SHALL aplicarse solo si el turno sigue en el horario y con la maquilladora que la clienta vio. Repetir la misma confirmación MUST responder éxito sin otro cambio. Si el turno ya cambió por otra vía, el servidor MUST rechazar y pedir recargar.

#### Scenario: Doble clic
- **WHEN** la clienta confirma dos veces seguidas el mismo cambio
- **THEN** el turno queda reprogramado una sola vez y ambas respuestas son de éxito

#### Scenario: Turno ya cambiado
- **WHEN** confirma desde una pantalla vieja de un turno que otra pestaña ya movió
- **THEN** se rechaza con un mensaje que pide recargar y no cambia nada

### Requirement: Seguridad frente a cancelación del studio
La reprogramación MUST NOT mover turnos de una reserva que dejó de estar `confirmada` en el mismo instante. Si una cancelación gana la carrera, la reprogramación MUST rechazarse y la reserva MUST quedar cancelada con todas sus líneas inactivas.

#### Scenario: Cancelación primero
- **WHEN** el studio cancela la reserva justo antes de confirmarse la reprogramación
- **THEN** la reprogramación se rechaza y la reserva sigue cancelada con sus líneas inactivas

#### Scenario: Reprogramación primero
- **WHEN** la reprogramación se confirma antes de la cancelación
- **THEN** la cancelación procede y deja inactivo el turno con su horario nuevo

### Requirement: Sin tope ni historial en esta versión
El sistema SHALL permitir reprogramar el mismo turno cuantas veces la clienta quiera mientras cumpla el plazo, y MUST NOT guardar el horario anterior.

#### Scenario: Varias reprogramaciones
- **WHEN** la clienta reprograma el mismo turno dos veces, cada una con 24 horas o más
- **THEN** ambas se aceptan
