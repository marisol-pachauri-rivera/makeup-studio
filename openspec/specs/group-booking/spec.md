# group-booking Specification

## Purpose

TBD - created by archiving change reserva-grupal. Update Purpose after archive.

## Requirements

### Requirement: Creación transaccional de la reserva grupal
Al confirmar un grupo, el sistema SHALL crear en una única transacción una sola reserva en estado `pendiente_pago`, sin número de operación, con el nombre y el teléfono de quien reserva, y una línea activa por integrante con su propio nombre, servicio, maquilladora y horario. La reserva MUST tener un solo token y un solo estado. Si cualquier parte falla, MUST NOT quedar guardada ninguna reserva ni ninguna línea.

#### Scenario: Grupo de tres integrantes
- **WHEN** una clienta confirma un grupo de tres integrantes con horarios libres y datos válidos
- **THEN** existe una reserva `pendiente_pago` con tres líneas activas y un único token, y los tres horarios dejan de ofrecerse a otras clientas

#### Scenario: Contacto de quien reserva
- **WHEN** se crea el grupo
- **THEN** el nombre y el teléfono de la reserva son los de quien reserva y cada línea guarda el nombre de su integrante como persona a maquillar

#### Scenario: Fin de cada turno por su servicio
- **WHEN** una integrante elige un servicio de 90 minutos a las 10:00 y otra uno de 60 minutos a las 10:00 con otra maquilladora
- **THEN** la primera línea va de 10:00 a 11:30 y la segunda de 10:00 a 11:00

#### Scenario: Integrantes con distinta maquilladora a la misma hora
- **WHEN** dos integrantes eligen el mismo horario con maquilladoras distintas
- **THEN** ambas líneas se crean

#### Scenario: Todo o nada ante una falla
- **WHEN** la inserción de la tercera línea falla después de insertar la reserva y las dos primeras
- **THEN** no queda guardada ninguna reserva ni ninguna línea

#### Scenario: Sin sesión
- **WHEN** una visitante sin cuenta confirma un grupo
- **THEN** se crea igual, porque las clientas no tienen cuenta

### Requirement: Monto total del grupo
El monto total de la reserva grupal SHALL ser la suma de los precios de sus líneas al momento de reservar, y cada línea MUST guardar el precio de su servicio como copia. La suma MUST ser exacta, sin redondeos de punto flotante.

#### Scenario: Suma de precios distintos
- **WHEN** tres integrantes reservan servicios de 350.50, 120.10 y 80.00
- **THEN** el monto total de la reserva es 550.60 y cada línea conserva su precio

#### Scenario: Cambio de precio posterior
- **WHEN** el panel cambia el precio de un servicio después de crear el grupo
- **THEN** el monto total y los precios de las líneas no cambian

### Requirement: El grupo debe estar completo y dentro del tamaño permitido
El sistema SHALL rechazar la reserva grupal, sin tocar la base, si el grupo tiene menos de 2 o más de 10 integrantes, o si alguna integrante no tiene nombre (1 a 100 caracteres, recortado), servicio, maquilladora y horario válidos. El rechazo MUST indicar el error por integrante y campo.

#### Scenario: Integrante sin nombre
- **WHEN** llega un grupo donde la segunda integrante tiene el nombre vacío
- **THEN** se rechaza con un error en el nombre de la segunda integrante y no se crea nada

#### Scenario: Integrante sin servicio o sin horario
- **WHEN** llega un grupo donde una integrante no tiene servicio o no tiene horario
- **THEN** se rechaza con un error en esa integrante y no se crea nada

#### Scenario: Grupo demasiado grande
- **WHEN** llega un grupo de 11 integrantes
- **THEN** se rechaza sin crear nada

#### Scenario: Grupo de una sola persona
- **WHEN** llega una solicitud grupal con una sola integrante
- **THEN** se rechaza y se indica que una reserva de una persona es individual

#### Scenario: Entrada manipulada
- **WHEN** la lista de integrantes llega con un formato que no es el esperado
- **THEN** se rechaza como solicitud inválida sin tocar la base

#### Scenario: Contacto inválido
- **WHEN** el nombre o el teléfono de quien reserva son inválidos
- **THEN** se rechaza con el error en el campo correspondiente, con las mismas reglas de la reserva individual

### Requirement: El servidor revalida la disponibilidad de todas las líneas
Antes de crear el grupo, el sistema SHALL comprobar que cada servicio y cada maquilladora están activos y que el horario de cada integrante es uno de los que se ofrecen en ese momento para su servicio y su maquilladora. Un horario que no se ofrece (ocupado, pasado, fuera del horario de trabajo, bloqueado o fuera de la grilla) MUST rechazarse como "horario ya no disponible" sin crear nada, e indicar a qué integrantes afecta. Las consultas de una transacción MUST ejecutarse en serie.

#### Scenario: Un horario ocupado entre varios libres
- **WHEN** de tres horarios del grupo uno ya lo ocupa otra reserva activa
- **THEN** se rechaza como horario ya no disponible, el rechazo señala a esa integrante y no se crea ninguna línea, tampoco las de los horarios libres

#### Scenario: Varios horarios afectados
- **WHEN** dos integrantes tienen un horario que ya no se ofrece
- **THEN** el rechazo señala a las dos

#### Scenario: Servicio o maquilladora inactivos
- **WHEN** el servicio o la maquilladora de alguna integrante fueron desactivados mientras la clienta armaba el grupo
- **THEN** se rechaza con un mensaje que lo explica, señalando a esa integrante, y no se crea nada

#### Scenario: Horario inventado o pasado
- **WHEN** el horario de una integrante cae fuera del horario de trabajo, fuera de la grilla o ya empezó
- **THEN** se rechaza como horario ya no disponible

### Requirement: Sin solapamientos dentro del grupo
El sistema SHALL rechazar el grupo si dos integrantes tienen la misma maquilladora en rangos que se solapan (rangos semiabiertos: un turno que empieza cuando otro termina no se solapa), con un error propio que señale a ambas integrantes, y sin depender de la restricción de exclusión de Postgres para detectarlo.

#### Scenario: Misma maquilladora, mismo horario
- **WHEN** dos integrantes eligen el mismo horario con la misma maquilladora
- **THEN** se rechaza con un error de solapamiento dentro del grupo que señala a ambas y no se crea nada

#### Scenario: Turnos que se pisan parcialmente
- **WHEN** una integrante reserva de 10:00 a 11:30 y otra de 11:00 a 12:00 con la misma maquilladora
- **THEN** se rechaza como solapamiento dentro del grupo

#### Scenario: Turnos contiguos
- **WHEN** una integrante termina a las 11:00 y otra empieza a las 11:00 con la misma maquilladora
- **THEN** ambas líneas se crean

#### Scenario: Solapamiento y horario ocupado a la vez
- **WHEN** el grupo tiene un solapamiento interno y además un horario ocupado por otra clienta
- **THEN** el rechazo informa ambos problemas, cada uno con sus integrantes

### Requirement: Choque con otra clienta durante la creación
Si otra clienta toma un horario del grupo entre la revalidación y la inserción, la base SHALL seguir siendo la garantía final: tanto el rechazo por exclusión como el bloqueo mutuo que Postgres pueda devolver MUST traducirse a "horario ya no disponible", sin dejar reserva ni líneas a medias y señalando al menos a la integrante cuya inserción falló. Cualquier otro error inesperado MUST relanzarse.

#### Scenario: Dos grupos simultáneos por el mismo horario
- **WHEN** dos grupos distintos piden a la vez un mismo horario con la misma maquilladora
- **THEN** exactamente un grupo se crea completo y el otro recibe "horario ya no disponible" sin ninguna fila a medias

#### Scenario: Un grupo choca con una reserva individual
- **WHEN** una reserva individual toma el horario de la última integrante justo antes de la inserción
- **THEN** el grupo no se guarda, ni siquiera las líneas ya insertadas, y se señala a esa integrante

#### Scenario: Bloqueo mutuo de Postgres
- **WHEN** la base aborta al perdedor con un bloqueo mutuo en vez de una exclusión
- **THEN** la clienta recibe el mismo mensaje de horario ya no disponible, no un error técnico

### Requirement: Idempotencia del envío del grupo
El grupo SHALL poder crearse con una clave de idempotencia. Reenviar una clave que ya creó un grupo MUST devolver esa misma reserva, con su mismo token, sin crear otra ni reportar un choque del grupo consigo mismo, incluso si los dos envíos llegan al mismo tiempo.

#### Scenario: Reenvío del grupo
- **WHEN** la misma clave se envía dos veces seguidas
- **THEN** existe una sola reserva con N líneas y ambas respuestas traen el mismo token

#### Scenario: Envíos simultáneos con la misma clave
- **WHEN** dos envíos con la misma clave llegan a la vez
- **THEN** existe una sola reserva y ninguna respuesta informa un horario no disponible

#### Scenario: Claves distintas
- **WHEN** dos envíos con claves distintas piden los mismos horarios
- **THEN** se tratan como dos clientas distintas y solo un grupo se crea

#### Scenario: Reenvío cuando los horarios ya no se ofrecen
- **WHEN** se reenvía la clave de un grupo ya creado y sus horarios ya no figuran como libres porque son suyos
- **THEN** se devuelve su token

### Requirement: El grupo y la liberación de reservas vencidas
La creación de cada línea del grupo SHALL poder reutilizar el mecanismo de liberación de reservas vencidas (ítem #8) cuando este exista: se aplica a cada línea y, si alguna no se puede liberar o insertar, el grupo completo MUST revertirse, incluidas las cancelaciones por vencimiento hechas dentro de esa misma transacción.

#### Scenario: Una línea ocupada por una reserva vencida
- **WHEN** el horario de una integrante lo ocupa una reserva vencida y las demás líneas están libres
- **THEN** se libera esa reserva vencida y se crean todas las líneas del grupo en la misma transacción

#### Scenario: Una línea que no se puede liberar
- **WHEN** el horario de una integrante lo ocupa una reserva que no venció
- **THEN** se rechaza el grupo completo y la cancelación de cualquier reserva vencida hecha para otra línea queda revertida
