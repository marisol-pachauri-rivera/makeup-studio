# booking-wizard Specification

## Purpose

Guiar a la clienta desde el horario elegido hasta la confirmación de su reserva, conservando lo que eligió y escribió aunque recargue la página o el horario se lo lleve otra clienta, sin guardar nada en el servidor hasta que confirma.

## Requirements

### Requirement: Elegir un horario inicia la reserva
Al elegir un horario libre en la pantalla de disponibilidad, el sistema SHALL guardar la selección (servicio, maquilladora y horario) en el estado del cliente y llevar a la clienta al paso de confirmación. Elegir un horario MUST NOT crear nada en el servidor.

#### Scenario: Elegir un horario
- **WHEN** la clienta elige el horario de las 09:30 de una maquilladora para un servicio
- **THEN** pasa al paso de confirmación y ve ese servicio, esa maquilladora y ese horario

#### Scenario: Nada en el servidor al elegir
- **WHEN** la clienta elige un horario y no confirma
- **THEN** no existe ninguna reserva y el horario sigue libre para otras clientas

#### Scenario: Cambiar de horario
- **WHEN** la clienta vuelve a la disponibilidad y elige otro horario
- **THEN** el paso de confirmación muestra el nuevo horario y conserva el nombre y el teléfono ya escritos

### Requirement: Estado del asistente con respaldo en sessionStorage
El estado del asistente SHALL vivir en el cliente y respaldarse en `sessionStorage` para sobrevivir a una recarga de la página. Un estado guardado MUST ignorarse si no tiene el formato esperado.

#### Scenario: Recarga en el paso de confirmación
- **WHEN** la clienta recarga la página del paso de confirmación
- **THEN** sigue viendo el mismo resumen y lo que había escrito

#### Scenario: Estado dañado o de otra versión
- **WHEN** el almacenamiento contiene datos que no tienen el formato esperado
- **THEN** se ignoran y el paso de confirmación indica que no hay una reserva en curso

#### Scenario: Nueva pestaña
- **WHEN** la clienta abre el paso de confirmación en una pestaña nueva sin selección previa
- **THEN** ve que no hay una reserva en curso y un enlace para elegir un servicio

### Requirement: Paso de confirmación con datos de contacto
El paso de confirmación SHALL mostrar el resumen de la reserva (servicio, maquilladora, día, hora, duración y precio) y pedir el nombre y el teléfono de contacto de la clienta antes de confirmar. Los errores de validación MUST mostrarse junto a cada campo y conservar lo escrito.

#### Scenario: Resumen completo
- **WHEN** la clienta llega al paso de confirmación
- **THEN** ve servicio, maquilladora, fecha y hora en hora de Lima, duración y precio exacto

#### Scenario: Datos inválidos
- **WHEN** envía el formulario con el nombre vacío o un teléfono con letras
- **THEN** ve un mensaje claro junto al campo, no se crea la reserva y lo escrito se conserva

#### Scenario: Botón mientras envía
- **WHEN** la clienta confirma y la solicitud está en curso
- **THEN** el botón queda deshabilitado hasta recibir la respuesta

### Requirement: Una clave de idempotencia por intento de reserva
El asistente SHALL generar una clave única al elegir un horario y enviar esa misma clave en cada reenvío de la misma reserva. Elegir otro horario MUST generar una clave nueva.

#### Scenario: Doble clic
- **WHEN** la clienta confirma dos veces seguidas con la misma selección
- **THEN** ambos envíos llevan la misma clave

#### Scenario: Otro horario, otra clave
- **WHEN** la clienta elige otro horario después de un intento
- **THEN** el nuevo intento usa una clave distinta de la anterior

### Requirement: Horario ya no disponible conserva lo demás
Si el servidor responde que el horario ya no está disponible, el asistente SHALL explicarlo con un mensaje claro y ofrecer volver a elegir horario con la misma maquilladora, conservando el servicio y el nombre y el teléfono ya escritos.

#### Scenario: Choque al confirmar
- **WHEN** otra clienta tomó el horario mientras esta completaba el paso de confirmación
- **THEN** ve que el horario ya no está disponible y un enlace a los horarios de la misma maquilladora

#### Scenario: Datos conservados
- **WHEN** vuelve a elegir y llega de nuevo al paso de confirmación
- **THEN** el nombre y el teléfono siguen escritos

### Requirement: Estado limpio al terminar
Al crearse la reserva, el asistente SHALL borrar su estado de `sessionStorage` y llevar a la clienta a la página de estado de su reserva.

#### Scenario: Reserva creada
- **WHEN** el servidor confirma la reserva
- **THEN** la clienta ve la página de estado de esa reserva y el estado del asistente ya no está guardado

#### Scenario: Volver atrás tras reservar
- **WHEN** la clienta vuelve al paso de confirmación después de reservar
- **THEN** ve que no hay una reserva en curso y no puede reenviar la anterior

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
