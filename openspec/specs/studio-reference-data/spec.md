# studio-reference-data Specification

## Purpose

Definir los datos de referencia del studio (servicios, maquilladoras, disponibilidad y administradores) y las reglas de integridad que la base de datos hace cumplir, para que el resto del sistema pueda confiar en ellos.

## Requirements

### Requirement: Catálogo de servicios
La base de datos SHALL almacenar servicios con nombre, descripción, precio, duración en minutos y un indicador de activo. El precio MUST NOT ser negativo y la duración MUST ser mayor que cero.

#### Scenario: Servicio válido
- **WHEN** se inserta un servicio con nombre, precio 0 o mayor y duración positiva
- **THEN** el servicio queda guardado y activo por defecto

#### Scenario: Precio negativo
- **WHEN** se intenta insertar o actualizar un servicio con precio negativo
- **THEN** la base rechaza la operación

#### Scenario: Duración no positiva
- **WHEN** se intenta guardar un servicio con duración 0 o negativa
- **THEN** la base rechaza la operación

### Requirement: Maquilladoras
La base de datos SHALL almacenar maquilladoras con nombre y un indicador de activa, activa por defecto. Una maquilladora referenciada por horarios, bloqueos o líneas de reserva MUST NOT poder borrarse.

#### Scenario: Desactivar en lugar de borrar
- **WHEN** se intenta borrar una maquilladora que tiene líneas de reserva
- **THEN** la base rechaza el borrado y la maquilladora conserva su historial

### Requirement: Horario de trabajo recurrente
La base de datos SHALL almacenar el horario de trabajo de cada maquilladora por día de la semana, con hora de inicio y de fin. El día MUST ser un valor de 0 a 6 y la hora de fin MUST ser posterior a la de inicio.

#### Scenario: Horario válido
- **WHEN** se inserta un horario de lunes de 09:00 a 18:00 para una maquilladora existente
- **THEN** el horario queda guardado

#### Scenario: Fin anterior al inicio
- **WHEN** se intenta guardar un horario cuya hora de fin no es posterior a la de inicio
- **THEN** la base rechaza la operación

#### Scenario: Día fuera de rango
- **WHEN** se intenta guardar un horario con día de la semana 7
- **THEN** la base rechaza la operación

### Requirement: Bloqueos de agenda
La base de datos SHALL almacenar bloqueos de agenda por maquilladora con un rango de fecha y hora y un motivo. El fin del rango MUST ser posterior al inicio.

#### Scenario: Bloqueo válido
- **WHEN** se inserta un bloqueo con fin posterior al inicio para una maquilladora existente
- **THEN** el bloqueo queda guardado

#### Scenario: Rango invertido
- **WHEN** se intenta guardar un bloqueo cuyo fin no es posterior a su inicio
- **THEN** la base rechaza la operación

### Requirement: Usuarios administradores
La base de datos SHALL almacenar usuarios administradores con un nombre de usuario único y el hash de su contraseña. MUST NOT existir una columna para guardar la contraseña en claro.

#### Scenario: Nombre de usuario repetido
- **WHEN** se intenta insertar un segundo administrador con el mismo nombre de usuario
- **THEN** la base rechaza la operación

### Requirement: Referencias íntegras
Toda referencia entre tablas SHALL estar respaldada por una clave foránea, de modo que MUST NOT existir un horario, un bloqueo o una línea de reserva que apunte a una maquilladora o servicio inexistente.

#### Scenario: Maquilladora inexistente
- **WHEN** se intenta insertar un horario para una maquilladora que no existe
- **THEN** la base rechaza la operación

### Requirement: Registro de intentos de inicio de sesión fallidos
La base de datos SHALL almacenar los intentos fallidos de inicio de sesión con el nombre de usuario normalizado que se intentó (exista o no como administradora) y el instante del intento, para que el límite de intentos del panel sobreviva entre invocaciones y despliegues. El registro MUST NOT contener contraseñas, ni en claro ni como hash.

#### Scenario: Fallo registrado
- **WHEN** se registra un intento fallido para el usuario `maria`
- **THEN** queda guardado con ese usuario y el instante actual, sin ningún dato de la contraseña

#### Scenario: Usuario inexistente
- **WHEN** se registra un intento fallido para un usuario que no existe en `usuario_admin`
- **THEN** el registro se guarda igual, sin requerir una administradora asociada

#### Scenario: Consulta por usuario y ventana
- **WHEN** se cuentan los fallos de un usuario desde un instante dado
- **THEN** la consulta se resuelve por un índice sobre usuario e instante, sin recorrer toda la tabla
