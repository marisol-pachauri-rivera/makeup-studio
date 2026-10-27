## Purpose

Crear en el servidor la reserva individual de una clienta de forma atómica y segura: validada, comprobada contra la disponibilidad real, sin duplicados por reenvío y con un mensaje claro cuando el horario se lo llevó otra clienta.

## ADDED Requirements

### Requirement: Creación transaccional de la reserva individual
Al confirmar, el sistema SHALL crear en una única transacción una reserva en estado `pendiente_pago`, sin número de operación, con el nombre y el teléfono de contacto, y una línea activa para la maquilladora y el horario elegidos, con el nombre de la clienta como persona a maquillar. Si cualquier parte falla, MUST NOT quedar guardada ninguna.

#### Scenario: Reserva creada
- **WHEN** una clienta confirma un servicio, una maquilladora y un horario libres con nombre y teléfono válidos
- **THEN** existe una reserva `pendiente_pago` con una línea activa en ese horario y el horario deja de ofrecerse a otras clientas

#### Scenario: Fin del turno por la duración
- **WHEN** el servicio dura 90 minutos y el horario elegido es 10:00
- **THEN** la línea va de 10:00 a 11:30

#### Scenario: Todo o nada
- **WHEN** la creación falla después de insertar la reserva y antes de insertar la línea
- **THEN** no queda ninguna reserva guardada

#### Scenario: Sin sesión
- **WHEN** una visitante sin cuenta confirma una reserva
- **THEN** se crea igual, porque las clientas no tienen cuenta

### Requirement: Token de acceso y monto
La reserva creada SHALL recibir un token de acceso no adivinable, generado por la base, que se devuelve a la clienta como parte de la respuesta. El monto total MUST ser el precio del servicio al momento de reservar y la línea MUST guardar ese mismo precio como copia.

#### Scenario: Token devuelto
- **WHEN** se crea la reserva
- **THEN** la respuesta incluye el token con el que se abre su página de estado

#### Scenario: Precio al reservar
- **WHEN** el servicio cuesta 350.50 al reservar y luego el panel lo cambia a 400.00
- **THEN** la reserva conserva el monto 350.50 y la línea el precio 350.50

### Requirement: Validación de lo que envía la clienta
El sistema SHALL validar toda entrada antes de tocar la base: identificadores positivos, horario con formato de instante, nombre de 1 a 100 caracteres con espacios sobrantes recortados y teléfono con 7 a 15 dígitos que admite espacios, guiones, paréntesis y un `+` inicial. Una entrada inválida MUST rechazarse con un mensaje por campo y sin crear nada.

#### Scenario: Nombre vacío
- **WHEN** el nombre llega vacío o solo con espacios
- **THEN** se rechaza con un error en el campo del nombre y no se crea nada

#### Scenario: Teléfono inválido
- **WHEN** el teléfono tiene letras o menos de 7 dígitos
- **THEN** se rechaza con un error en el campo del teléfono y no se crea nada

#### Scenario: Teléfono con formato
- **WHEN** el teléfono llega como "+51 999 111 222"
- **THEN** se acepta

#### Scenario: Entrada manipulada
- **WHEN** llega un identificador de servicio con texto o una fecha inexistente
- **THEN** se rechaza sin tocar la base

### Requirement: El servidor revalida la disponibilidad
Antes de crear la reserva, el sistema SHALL comprobar con la disponibilidad real que el servicio y la maquilladora están activos y que el horario elegido es uno de los que se ofrecen en ese momento. Un horario que no se ofrece (ocupado, pasado, fuera del horario de trabajo, bloqueado o fuera de la grilla) MUST rechazarse como "horario ya no disponible" sin crear nada.

#### Scenario: Horario ocupado
- **WHEN** otra reserva activa ya ocupa el horario elegido
- **THEN** se rechaza como horario ya no disponible

#### Scenario: Horario inventado
- **WHEN** el horario enviado cae fuera del horario de trabajo o fuera de la grilla de 30 minutos
- **THEN** se rechaza como horario ya no disponible

#### Scenario: Horario pasado
- **WHEN** el horario enviado ya empezó
- **THEN** se rechaza como horario ya no disponible

#### Scenario: Servicio o maquilladora inactivos
- **WHEN** el servicio o la maquilladora fueron desactivados mientras la clienta completaba el asistente
- **THEN** se rechaza con un mensaje que lo explica y no se crea nada

### Requirement: Choque de horario entre dos clientas
Si dos clientas confirman el mismo horario con la misma maquilladora casi al mismo tiempo, el sistema SHALL crear exactamente una reserva y responder "horario ya no disponible" a la otra, sin dejar datos a medias. La base MUST seguir siendo la garantía final: tanto el rechazo por exclusión como el abortado por bloqueo mutuo que Postgres pueda devolver al perdedor MUST traducirse al mismo mensaje.

#### Scenario: Dos envíos simultáneos
- **WHEN** dos clientas distintas confirman el mismo horario a la vez
- **THEN** una reserva se crea y la otra recibe "horario ya no disponible"

#### Scenario: Perdedor sin datos a medias
- **WHEN** una clienta pierde el choque
- **THEN** no existe ninguna reserva ni línea a su nombre

#### Scenario: Bloqueo mutuo de Postgres
- **WHEN** la base aborta al perdedor con un bloqueo mutuo en vez de un rechazo por exclusión
- **THEN** la clienta recibe el mismo mensaje de horario ya no disponible, no un error técnico

### Requirement: Idempotencia del envío
Cada reserva SHALL poder crearse con una clave de idempotencia. Reenviar una clave que ya creó una reserva MUST devolver esa misma reserva, con su mismo token, sin crear otra ni reportar un choque de horario consigo misma, incluso si los dos envíos llegan al mismo tiempo.

#### Scenario: Reenvío
- **WHEN** la misma clave se envía dos veces seguidas
- **THEN** existe una sola reserva y ambas respuestas traen el mismo token

#### Scenario: Envíos simultáneos con la misma clave
- **WHEN** dos envíos con la misma clave llegan a la vez
- **THEN** existe una sola reserva y ninguna respuesta informa un horario no disponible

#### Scenario: Claves distintas
- **WHEN** dos envíos con claves distintas piden el mismo horario
- **THEN** se trata como dos clientas distintas y solo una reserva se crea

#### Scenario: Clave que ya creó una reserva
- **WHEN** se reenvía la clave de una reserva cuyo horario sigue siendo suyo
- **THEN** se devuelve su token aunque la disponibilidad ya no ofrezca ese horario
