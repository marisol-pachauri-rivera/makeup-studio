# schedule-overlap-guard Specification

## Purpose

Garantizar desde la base de datos que una maquilladora nunca tenga dos turnos activos solapados, de modo que la regla se cumpla aunque dos solicitudes lleguen al mismo tiempo o la aplicación falle.

## Requirements

### Requirement: No solapamiento de líneas activas por maquilladora
La base de datos SHALL rechazar la inserción o actualización de una línea de reserva activa cuyo rango de tiempo se solape con el de otra línea activa de la misma maquilladora. Los rangos MUST tratarse como semiabiertos: incluyen el inicio y excluyen el fin.

#### Scenario: Solapamiento parcial
- **WHEN** existe una línea activa de 10:00 a 11:00 y se inserta otra activa de 10:30 a 11:30 para la misma maquilladora
- **THEN** la base rechaza la segunda inserción

#### Scenario: Solapamiento total
- **WHEN** se inserta una línea activa que contiene por completo el rango de otra activa de la misma maquilladora
- **THEN** la base rechaza la inserción

#### Scenario: Turnos contiguos
- **WHEN** existe una línea activa de 10:00 a 11:00 y se inserta otra activa de 11:00 a 12:00 para la misma maquilladora
- **THEN** la base acepta la inserción

### Requirement: Maquilladoras independientes
La restricción de solapamiento SHALL aplicarse por maquilladora: dos líneas activas de maquilladoras distintas MAY coincidir en el tiempo.

#### Scenario: Mismo horario con otra maquilladora
- **WHEN** existe una línea activa de 10:00 a 11:00 con la maquilladora A y se inserta otra de 10:00 a 11:00 con la maquilladora B
- **THEN** la base acepta la inserción

### Requirement: Las líneas inactivas no ocupan horario
Una línea con `activa` en falso MUST NOT bloquear el horario de la maquilladora, y MUST NOT ser bloqueada por otras líneas.

#### Scenario: Línea inactiva en el mismo horario
- **WHEN** existe una línea inactiva de 10:00 a 11:00 y se inserta una activa solapada para la misma maquilladora
- **THEN** la base acepta la inserción

#### Scenario: Desactivar libera el horario
- **WHEN** una línea activa se marca como inactiva y luego se inserta otra activa en su mismo horario
- **THEN** la segunda inserción se acepta

#### Scenario: Reactivar con horario ocupado
- **WHEN** una línea inactiva se reactiva y su horario ya lo ocupa otra línea activa de la misma maquilladora
- **THEN** la base rechaza la reactivación

### Requirement: Reprogramación sin choque
Actualizar el inicio y el fin de una línea activa SHALL validarse contra las demás líneas activas de la maquilladora, sin considerar la propia línea como conflicto.

#### Scenario: Mover a un horario libre
- **WHEN** se mueve una línea activa a un rango que se solapa solo con su propio rango anterior
- **THEN** la base acepta la actualización

#### Scenario: Mover a un horario ocupado
- **WHEN** se mueve una línea activa a un rango ocupado por otra línea activa de la misma maquilladora
- **THEN** la base rechaza la actualización y la línea conserva su horario anterior

### Requirement: Todo o nada en reservas de varias líneas
Cuando varias líneas se insertan en una misma transacción y una choca con la restricción, la transacción SHALL poder revertirse completa sin dejar ninguna línea guardada.

#### Scenario: Choque en la segunda línea
- **WHEN** una transacción inserta dos líneas y la segunda se solapa con una línea activa existente
- **THEN** al revertir la transacción no queda guardada ninguna de las dos líneas

### Requirement: Solicitudes simultáneas por el mismo horario
Ante dos transacciones concurrentes que intentan ocupar el mismo horario de la misma maquilladora, la base SHALL aceptar exactamente una y rechazar la otra.

#### Scenario: Doble reserva simultánea
- **WHEN** dos conexiones insertan al mismo tiempo una línea activa para la misma maquilladora y el mismo rango
- **THEN** una inserción se confirma y la otra falla
- **AND** la que falla puede reportar violación de exclusión o, si ambas se esperaron mutuamente, deadlock detectado; la aplicación MUST tratar ambos casos como horario no disponible
- **AND** nunca quedan dos líneas activas solapadas

### Requirement: Choque identificable como violación de exclusión
El rechazo por solapamiento SHALL poder distinguirse de otros errores de la base mediante su código de error de violación de restricción de exclusión, para que la aplicación lo traduzca a un mensaje de horario no disponible.

#### Scenario: Código de error
- **WHEN** una inserción es rechazada por solapamiento
- **THEN** el error reportado por la base lleva el código de violación de exclusión y el nombre de la restricción

### Requirement: El vencimiento no libera horario por sí solo
La base de datos MUST NOT liberar un horario por el paso del tiempo: una línea activa de una reserva no pagada sigue ocupando el horario hasta que la aplicación la desactive.

#### Scenario: Reserva sin pagar con más de 20 minutos
- **WHEN** una línea activa pertenece a una reserva en `pendiente_pago` creada hace más de 20 minutos y no fue desactivada
- **THEN** insertar otra línea activa solapada sigue siendo rechazado por la base
