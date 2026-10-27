## Purpose

Guiar a la clienta desde el horario elegido hasta la confirmación de su reserva, conservando lo que eligió y escribió aunque recargue la página o el horario se lo lleve otra clienta, sin guardar nada en el servidor hasta que confirma.

## ADDED Requirements

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
