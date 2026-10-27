## ADDED Requirements

### Requirement: Armar un grupo en el asistente
El paso de confirmación SHALL permitir activar la reserva grupal, agregar y quitar integrantes y definir para cada una su nombre, su servicio, su maquilladora y su horario. La reserva individual MUST seguir funcionando sin cambios cuando no se activa el modo grupal. El grupo MUST tener entre 2 y 10 integrantes: el asistente impide agregar más de 10 y no permite confirmar con menos de 2.

#### Scenario: Activar el modo grupal
- **WHEN** la clienta que ya eligió un horario activa la reserva grupal
- **THEN** ve una lista con una primera integrante que lleva ese servicio, esa maquilladora y ese horario, y puede agregar otra

#### Scenario: Agregar una integrante
- **WHEN** la clienta agrega una integrante
- **THEN** aparece en la lista sin nombre ni horario y marcada como incompleta

#### Scenario: Quitar una integrante
- **WHEN** la clienta quita una integrante
- **THEN** desaparece de la lista y el resto conserva sus datos

#### Scenario: Tamaño máximo
- **WHEN** el grupo ya tiene 10 integrantes
- **THEN** no se puede agregar otra y se explica el límite

#### Scenario: Quedan menos de dos
- **WHEN** el grupo queda con una sola integrante
- **THEN** el asistente no permite confirmar como grupo y ofrece volver a la reserva individual

#### Scenario: Sin modo grupal
- **WHEN** la clienta nunca activa la reserva grupal
- **THEN** el paso de confirmación y la reserva se comportan igual que antes

### Requirement: Elegir el horario de cada integrante
Cada integrante SHALL elegir su propio servicio, maquilladora y horario con el catálogo y la disponibilidad ya existentes. Al elegir un horario mientras una integrante está en edición, el asistente MUST asignarlo a esa integrante, conservar a todas las demás y a quien reserva, y volver al paso de confirmación; no debe reemplazar la selección de otras integrantes.

#### Scenario: Elegir para una integrante
- **WHEN** la clienta pide elegir el horario de la tercera integrante y elige las 11:00 de una maquilladora
- **THEN** vuelve al paso de confirmación y la tercera integrante muestra ese servicio, esa maquilladora y las 11:00, mientras las otras no cambian

#### Scenario: Cambiar el horario de una integrante
- **WHEN** la clienta elige otro horario para una integrante que ya tenía uno
- **THEN** se reemplaza solo el de esa integrante

#### Scenario: Elegir sin integrante en edición
- **WHEN** la clienta elige un horario sin tener ninguna integrante en edición
- **THEN** se comporta como la reserva individual de siempre

### Requirement: No se confirma un grupo incompleto
El asistente SHALL deshabilitar la confirmación del grupo mientras alguna integrante no tenga nombre, servicio, maquilladora y horario, y MUST señalar cuáles integrantes están incompletas y qué les falta. El servidor MUST volver a exigirlo.

#### Scenario: Una integrante sin horario
- **WHEN** una integrante no tiene horario
- **THEN** el botón de confirmar está deshabilitado y esa integrante aparece marcada como sin horario

#### Scenario: Una integrante sin nombre
- **WHEN** una integrante no tiene nombre
- **THEN** el botón de confirmar está deshabilitado y esa integrante aparece marcada como sin nombre

#### Scenario: Grupo completo
- **WHEN** todas las integrantes tienen nombre, servicio, maquilladora y horario, y quien reserva escribió su nombre y teléfono
- **THEN** el botón de confirmar está habilitado

#### Scenario: Resumen del grupo
- **WHEN** el grupo está completo
- **THEN** el paso de confirmación muestra a cada integrante con su servicio, maquilladora, día y hora (hora de Lima) y el monto total

### Requirement: El grupo se conserva ante recargas y ante un choque parcial
El grupo SHALL guardarse en el estado del asistente de `sessionStorage` mediante un campo opcional de personas, sin cambiar la versión del estado ni invalidar un estado individual ya guardado. Ante un choque de horario, el asistente MUST indicar qué integrantes chocaron, conservar al resto con sus horarios y conservar a quien reserva, y permitir elegir de nuevo solo el horario de las afectadas. El estado guardado con un formato inesperado MUST ignorarse.

#### Scenario: Recarga con grupo armado
- **WHEN** la clienta recarga el paso de confirmación con un grupo armado
- **THEN** ve el mismo grupo, con sus datos y sus horarios

#### Scenario: Estado individual anterior
- **WHEN** el almacenamiento contiene un estado individual guardado antes de este cambio
- **THEN** se lee igual y se comporta como reserva individual

#### Scenario: Estado de grupo dañado
- **WHEN** el campo de personas guardado no tiene el formato esperado
- **THEN** el estado completo se ignora y se indica que no hay una reserva en curso

#### Scenario: Choque de una integrante
- **WHEN** el servidor informa que el horario de la segunda integrante ya no está disponible
- **THEN** el asistente marca a esa integrante, conserva a las demás con sus horarios, y ofrece elegir de nuevo el horario de la segunda con su misma maquilladora

#### Scenario: Elegir de nuevo tras el choque
- **WHEN** la clienta vuelve a elegir el horario de la integrante afectada
- **THEN** el grupo queda completo otra vez sin que las demás hayan perdido nada, y el nuevo intento usa una clave de idempotencia distinta

#### Scenario: Solapamiento dentro del grupo
- **WHEN** el servidor informa que dos integrantes se solapan con la misma maquilladora
- **THEN** el asistente marca a ambas con un mensaje que explica el solapamiento y no pierde ningún dato

### Requirement: Estado limpio al terminar el grupo
Al crearse la reserva grupal, el asistente SHALL borrar todo su estado, incluidas las integrantes, y llevar a la clienta a la página de estado de la reserva.

#### Scenario: Grupo creado
- **WHEN** el servidor confirma la reserva grupal
- **THEN** la clienta ve la página de estado del grupo y el almacenamiento ya no conserva integrantes

#### Scenario: Volver atrás tras reservar
- **WHEN** la clienta vuelve al paso de confirmación después de reservar el grupo
- **THEN** ve que no hay una reserva en curso y no puede reenviar el grupo anterior
