## Purpose

Permitir que el studio administre a sus maquilladoras desde el panel (crear, renombrar, desactivar y reactivar) sin tocar la base de datos, conservando el historial de agenda y reservas de cada una.

## ADDED Requirements

### Requirement: Listado de maquilladoras del panel
El panel SHALL mostrar a una administradora con sesión todas las maquilladoras, activas e inactivas, con su nombre y estado, y un acceso para crear una nueva y para editar cada una. Las inactivas MUST distinguirse a simple vista de las activas.

#### Scenario: Listado con activas e inactivas
- **WHEN** una administradora abre la sección de maquilladoras y existen activas e inactivas
- **THEN** ve todas, cada una con una marca clara de si está activa o inactiva

#### Scenario: Sin maquilladoras
- **WHEN** no existe ninguna maquilladora
- **THEN** la sección indica que aún no hay maquilladoras y ofrece crear la primera

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión válida pide la sección de maquilladoras
- **THEN** es llevado al inicio de sesión y no recibe ningún dato de las maquilladoras

### Requirement: Alta de maquilladoras
El sistema SHALL permitir a una administradora crear una maquilladora indicando su nombre. La maquilladora nueva MUST quedar activa y la administradora MUST volver al listado viendo la maquilladora creada.

#### Scenario: Alta válida
- **WHEN** la administradora envía el nombre "Lucía"
- **THEN** la maquilladora queda guardada y activa y aparece en el listado

#### Scenario: Nombre repetido
- **WHEN** se crea una maquilladora con el mismo nombre que otra existente
- **THEN** se guarda igual, porque el nombre no es un identificador único

### Requirement: Edición de maquilladoras
El sistema SHALL permitir a una administradora cambiar el nombre de una maquilladora existente con las mismas reglas de validación que el alta. Editarla MUST NOT alterar sus horarios, bloqueos ni reservas.

#### Scenario: Cambio de nombre
- **WHEN** la administradora renombra a una maquilladora que tiene reservas
- **THEN** el listado muestra el nombre nuevo y sus horarios, bloqueos y reservas siguen asociados a ella

#### Scenario: Maquilladora inexistente
- **WHEN** se intenta editar una maquilladora que no existe
- **THEN** no se modifica ningún dato y la administradora recibe una respuesta de "no encontrada"

### Requirement: Desactivación y reactivación de maquilladoras
El sistema SHALL permitir a una administradora desactivar una maquilladora y volver a activarla, sin borrarla nunca. Desactivarla MUST NOT modificar ni cancelar sus reservas existentes, sus horarios ni sus bloqueos.

#### Scenario: Desactivar
- **WHEN** la administradora desactiva una maquilladora activa
- **THEN** queda inactiva, sigue apareciendo en el listado del panel y sus reservas, horarios y bloqueos no cambian

#### Scenario: Reactivar
- **WHEN** la administradora activa una maquilladora inactiva
- **THEN** vuelve a quedar activa

#### Scenario: Sin opción de borrado
- **WHEN** una administradora revisa las acciones disponibles sobre una maquilladora
- **THEN** no existe ninguna acción para borrarla

### Requirement: Validación de los datos de la maquilladora
El sistema SHALL validar en el servidor, antes de consultar la base, que el nombre sea texto no vacío tras quitar espacios de los extremos y de hasta 100 caracteres. Un dato inválido MUST rechazarse con un mensaje en español y sin guardar nada.

#### Scenario: Nombre vacío
- **WHEN** se envía una maquilladora con el nombre vacío o solo con espacios
- **THEN** no se guarda nada y se indica que el nombre es obligatorio

#### Scenario: Nombre demasiado largo
- **WHEN** se envía un nombre de más de 100 caracteres
- **THEN** no se guarda nada y se indica el límite de longitud

#### Scenario: Se conserva lo escrito
- **WHEN** un envío es rechazado por un nombre inválido
- **THEN** el formulario sigue mostrando lo que la administradora había escrito

### Requirement: Escrituras de maquilladoras solo con sesión de administradora
Toda acción que cree, renombre, desactive o reactive una maquilladora SHALL verificar la sesión de administradora antes que cualquier otra cosa, y MUST fallar sin tocar la base cuando no hay sesión válida, aunque se la invoque directamente fuera de la interfaz.

#### Scenario: Acción invocada sin sesión
- **WHEN** se invoca la acción de crear, renombrar o cambiar el estado de una maquilladora sin sesión válida
- **THEN** la acción se rechaza como no autorizada y no se escribe ni se lee ningún dato

#### Scenario: Administradora dada de baja
- **WHEN** una administradora cuya fila ya fue borrada de `usuario_admin` invoca una acción con una sesión aún vigente
- **THEN** la acción se rechaza como no autorizada
