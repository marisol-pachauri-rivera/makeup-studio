## Purpose

Permitir que el studio cargue y mantenga el horario de trabajo semanal de cada maquilladora desde el panel, sin tocar la base de datos, de modo que la disponibilidad pública pueda calcularse a partir de él.

## ADDED Requirements

### Requirement: Pantalla de agenda por maquilladora
El panel SHALL ofrecer a una administradora con sesión una pantalla de agenda por cada maquilladora, activa o inactiva, accesible desde el listado y desde la edición de maquilladoras. La pantalla MUST mostrar el nombre de la maquilladora y su horario semanal.

#### Scenario: Acceso desde el listado
- **WHEN** la administradora abre la agenda de una maquilladora desde el listado
- **THEN** ve el nombre de esa maquilladora y sus tramos de horario agrupados por día de la semana

#### Scenario: Maquilladora inactiva
- **WHEN** la administradora abre la agenda de una maquilladora inactiva
- **THEN** puede ver y modificar su horario igual que el de una activa

#### Scenario: Maquilladora inexistente
- **WHEN** se pide la agenda de una maquilladora que no existe o con un identificador inválido
- **THEN** se responde "no encontrado" y no se muestra ningún dato

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión válida pide la agenda de una maquilladora
- **THEN** es llevado al inicio de sesión y no recibe ningún dato de la agenda

### Requirement: Consulta del horario semanal
La pantalla SHALL mostrar los siete días de la semana, comenzando por el lunes, y bajo cada uno los tramos cargados ordenados por hora de inicio, con hora de inicio y de fin. Un día sin tramos MUST indicar que la maquilladora no trabaja ese día.

#### Scenario: Día con dos tramos
- **WHEN** una maquilladora tiene los tramos 09:00–13:00 y 15:00–19:00 el martes
- **THEN** el martes muestra ambos tramos, el de la mañana primero

#### Scenario: Día sin tramos
- **WHEN** una maquilladora no tiene ningún tramo el domingo
- **THEN** el domingo indica que no trabaja ese día

### Requirement: Alta de un tramo de horario
El sistema SHALL permitir a una administradora agregar un tramo indicando día de la semana, hora de inicio y hora de fin. La hora de fin MUST ser posterior a la de inicio y las horas MUST tener formato de hora válido. Un tramo MUST NOT solaparse con otro de la misma maquilladora en el mismo día; tramos contiguos (el fin de uno igual al inicio del siguiente) están permitidos.

#### Scenario: Alta válida
- **WHEN** la administradora agrega lunes de 09:00 a 18:00 a una maquilladora sin tramos ese día
- **THEN** el tramo queda guardado y aparece en el lunes

#### Scenario: Fin no posterior al inicio
- **WHEN** envía un tramo con hora de fin igual o anterior a la de inicio
- **THEN** no se guarda y se muestra un error en el campo de la hora de fin

#### Scenario: Tramo solapado
- **WHEN** agrega martes de 12:00 a 16:00 y ya existe martes de 09:00 a 13:00
- **THEN** no se guarda y se explica que se solapa con un tramo existente

#### Scenario: Tramos contiguos
- **WHEN** agrega martes de 13:00 a 17:00 y ya existe martes de 09:00 a 13:00
- **THEN** se guarda, porque no se solapan

#### Scenario: Entrada inválida
- **WHEN** envía un día fuera de lunes–domingo o una hora que no existe, como 25:00
- **THEN** no se guarda y se muestra un mensaje claro en el campo correspondiente, conservando lo escrito en los demás

### Requirement: Baja de un tramo de horario
El sistema SHALL permitir a una administradora quitar un tramo de la maquilladora. Quitarlo MUST ser un borrado real y MUST NOT afectar a las reservas ni a otros tramos.

#### Scenario: Quitar un tramo
- **WHEN** la administradora quita el tramo lunes 09:00–18:00
- **THEN** el tramo deja de aparecer y los demás tramos de la maquilladora siguen igual

#### Scenario: Tramo ya quitado
- **WHEN** se intenta quitar un tramo que ya no existe, por ejemplo por un reenvío
- **THEN** la pantalla no falla y refleja el estado actual

#### Scenario: Tramo de otra maquilladora
- **WHEN** se intenta quitar un tramo indicando la agenda de una maquilladora a la que no pertenece
- **THEN** el tramo no se borra

### Requirement: Escrituras solo con sesión de administradora
Toda acción de escritura sobre el horario SHALL verificar la sesión de administradora en el servidor y validar sus entradas antes de tocar la base, aunque se invoque directamente sin pasar por la pantalla.

#### Scenario: Acción sin sesión
- **WHEN** se invoca directamente la acción de agregar o quitar un tramo sin sesión válida
- **THEN** se rechaza y no se modifica ningún dato
