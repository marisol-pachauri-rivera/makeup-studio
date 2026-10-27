# Spec Delta

## Purpose

Permitir que los tests del proyecto se ejecuten contra un PostgreSQL real, de modo que las restricciones de base de datos de las que depende el negocio puedan probarse de forma confiable y repetible.

## ADDED Requirements

### Requirement: Comando único de tests
El proyecto SHALL ejecutar toda la suite con `npm run test`, y ese comando MUST terminar con código de salida distinto de cero si algún test falla.

#### Scenario: Suite exitosa
- **WHEN** se ejecuta `npm run test` y todos los tests pasan
- **THEN** el comando termina con código de salida 0

#### Scenario: Test fallido
- **WHEN** se ejecuta `npm run test` y al menos un test falla
- **THEN** el comando termina con código de salida distinto de cero

### Requirement: Tests contra PostgreSQL real
Los tests que usan base de datos SHALL ejecutarse contra un servidor PostgreSQL real y MUST NOT usar un sustituto en memoria ni un simulacro del motor, porque el negocio depende de restricciones propias de Postgres.

#### Scenario: Test de integración con base
- **WHEN** corre un test que consulta la base
- **THEN** la consulta se ejecuta en un servidor PostgreSQL real

#### Scenario: Base de pruebas no disponible
- **WHEN** no hay un PostgreSQL de pruebas accesible al correr los tests de base de datos
- **THEN** la ejecución falla con un mensaje que indica cómo levantarlo, sin pasar los tests en silencio

### Requirement: Aislamiento de la base de pruebas
Los tests MUST NOT leer ni escribir en la base de desarrollo ni en la de producción. La base de pruebas SHALL ser independiente y el estado de un test MUST NOT afectar a otro.

#### Scenario: Configuración apuntando a una base no destinada a pruebas
- **WHEN** la URL de la base de pruebas coincide con la de la base de desarrollo o producción
- **THEN** la ejecución se aborta antes de correr ningún test

#### Scenario: Orden de ejecución
- **WHEN** dos tests de base se ejecutan en distinto orden
- **THEN** ambos obtienen el mismo resultado

### Requirement: Migraciones aplicadas antes de los tests
Antes de correr los tests de base de datos, el entorno SHALL aplicar las migraciones versionadas del proyecto sobre la base de pruebas. Si todavía no existen migraciones, el procedimiento MUST ejecutarse sin error.

#### Scenario: Base de pruebas vacía
- **WHEN** se inicia la suite sobre una base de pruebas vacía
- **THEN** las migraciones disponibles se aplican antes del primer test

#### Scenario: Sin migraciones definidas
- **WHEN** el proyecto aún no tiene migraciones
- **THEN** la preparación termina sin error y los tests corren

### Requirement: Prueba de reintento acotado
La suite SHALL incluir pruebas automatizadas del reintento acotado ante fallo de conexión, que no dependan de suspender una base real.

#### Scenario: Fallo transitorio simulado
- **WHEN** una prueba simula un fallo de conexión seguido de un éxito
- **THEN** la prueba verifica que la consulta se completó tras reintentar

#### Scenario: Agotamiento simulado
- **WHEN** una prueba simula fallos de conexión en todos los intentos
- **THEN** la prueba verifica que el número de intentos fue el máximo definido y que se propagó el error
