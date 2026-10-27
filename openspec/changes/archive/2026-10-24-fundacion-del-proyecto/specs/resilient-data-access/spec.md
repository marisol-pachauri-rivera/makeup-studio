# Spec Delta

## Purpose

Define cómo la aplicación accede a la base de datos y se comporta cuando esta está suspendida por inactividad, para que la clienta no vea errores por la latencia de reactivación de la base gratuita.

## ADDED Requirements

### Requirement: Conexión configurada por entorno
La aplicación SHALL obtener la conexión a la base de datos únicamente de la variable de entorno `DATABASE_URL` y MUST fallar al arrancar el acceso a datos con un mensaje claro si esa variable no está definida. La URL MUST NOT estar escrita en el código ni versionada.

#### Scenario: Variable definida
- **WHEN** `DATABASE_URL` está definida con una URL válida
- **THEN** la capa de acceso a datos queda disponible para ejecutar consultas

#### Scenario: Variable ausente
- **WHEN** `DATABASE_URL` no está definida y se intenta usar el acceso a datos
- **THEN** se lanza un error que nombra la variable faltante, sin exponer ningún secreto

### Requirement: Reintento acotado ante fallo de conexión
Cuando una consulta falla por un error transitorio de conexión (como la suspensión de la base por inactividad), el sistema SHALL reintentarla un número máximo fijo de veces con una espera corta entre intentos. El número de intentos y la espera MUST ser finitos y estar definidos en un solo lugar.

#### Scenario: La base despierta durante los reintentos
- **WHEN** una consulta falla por conexión y un reintento posterior tiene éxito
- **THEN** la consulta devuelve su resultado normal y el llamador no recibe error

#### Scenario: Se agotan los reintentos
- **WHEN** todos los intentos permitidos fallan por conexión
- **THEN** el sistema deja de reintentar y propaga un error de acceso a datos

### Requirement: Solo se reintentan errores transitorios
El sistema MUST NOT reintentar errores que no sean de conexión, como violaciones de restricciones, errores de sintaxis o de datos, porque reintentarlos no cambia el resultado y puede duplicar efectos.

#### Scenario: Violación de restricción
- **WHEN** una consulta falla por una violación de restricción de la base
- **THEN** el error se propaga de inmediato, sin ningún reintento

### Requirement: Error de acceso a datos sin detalles técnicos hacia la clienta
Cuando el acceso a datos falla definitivamente, el detalle técnico del error (mensaje de la base, cadena de conexión, traza) SHALL quedar solo en los registros del servidor y MUST NOT incluirse en lo que recibe la clienta.

#### Scenario: Falla definitiva
- **WHEN** el acceso a datos falla tras agotar los reintentos durante el render de una página
- **THEN** la clienta ve la página de error amigable y ningún detalle técnico de la falla
