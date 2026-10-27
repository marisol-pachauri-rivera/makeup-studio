## Purpose

Permitir que el studio administre su catálogo de servicios desde el panel (crear, editar, desactivar y reactivar) sin tocar la base de datos, conservando intactas las reservas ya hechas.

## ADDED Requirements

### Requirement: Listado de servicios del panel
El panel SHALL mostrar a una administradora con sesión todos los servicios, activos e inactivos, con nombre, precio, duración y estado, y un acceso para crear uno nuevo y para editar cada uno. Los inactivos MUST distinguirse a simple vista de los activos.

#### Scenario: Listado con activos e inactivos
- **WHEN** una administradora abre la sección de servicios y existen servicios activos e inactivos
- **THEN** ve todos, cada uno con su precio, su duración y una marca clara de si está activo o inactivo

#### Scenario: Catálogo vacío
- **WHEN** no existe ningún servicio
- **THEN** la sección indica que aún no hay servicios y ofrece crear el primero

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión válida pide la sección de servicios
- **THEN** es llevado al inicio de sesión y no recibe ningún dato del catálogo

### Requirement: Alta de servicios
El sistema SHALL permitir a una administradora crear un servicio con nombre, descripción opcional, precio y duración en minutos. El servicio nuevo MUST quedar activo y la administradora MUST volver al listado viendo el servicio creado.

#### Scenario: Alta válida
- **WHEN** la administradora envía nombre "Maquillaje social", precio "350" y duración "60"
- **THEN** el servicio queda guardado y activo, con precio 350.00 y duración de 60 minutos, y aparece en el listado

#### Scenario: Descripción omitida
- **WHEN** se envía un servicio válido sin descripción
- **THEN** el servicio se guarda con descripción vacía

### Requirement: Edición de servicios
El sistema SHALL permitir a una administradora modificar el nombre, la descripción, el precio y la duración de un servicio existente, aplicando las mismas reglas de validación que el alta. Editar un servicio MUST NOT alterar las reservas ya creadas ni los precios guardados en sus líneas.

#### Scenario: Cambio de precio
- **WHEN** la administradora cambia el precio de un servicio que ya tiene líneas de reserva
- **THEN** el servicio muestra el precio nuevo y las líneas existentes conservan el precio con el que se reservaron

#### Scenario: Servicio inexistente
- **WHEN** se intenta editar un servicio que no existe
- **THEN** no se modifica ningún dato y la administradora recibe una respuesta de "no encontrado"

### Requirement: Desactivación y reactivación de servicios
El sistema SHALL permitir a una administradora desactivar un servicio y volver a activarlo, sin borrarlo nunca. Desactivar un servicio MUST NOT modificar ni cancelar reservas existentes que lo incluyan.

#### Scenario: Desactivar
- **WHEN** la administradora desactiva un servicio activo
- **THEN** el servicio queda inactivo, sigue apareciendo en el listado del panel y sus reservas existentes no cambian

#### Scenario: Reactivar
- **WHEN** la administradora activa un servicio inactivo
- **THEN** el servicio vuelve a quedar activo

#### Scenario: Sin opción de borrado
- **WHEN** una administradora revisa las acciones disponibles sobre un servicio
- **THEN** no existe ninguna acción para borrarlo

### Requirement: Validación de los datos del servicio
El sistema SHALL validar en el servidor, antes de consultar la base, que el nombre sea texto no vacío tras quitar espacios de los extremos (hasta 100 caracteres), la descripción tenga hasta 500 caracteres, el precio sea un monto decimal de 0 o más con hasta dos decimales, y la duración sea un entero positivo de hasta 720 minutos. Un dato inválido MUST rechazarse con un mensaje en español que indique qué campo falló y sin guardar nada.

#### Scenario: Nombre vacío
- **WHEN** se envía un servicio con el nombre vacío o solo con espacios
- **THEN** no se guarda nada y se indica que el nombre es obligatorio

#### Scenario: Precio inválido
- **WHEN** se envía un precio negativo, con más de dos decimales o que no es un número
- **THEN** no se guarda nada y se indica que el precio no es válido

#### Scenario: Precio con coma decimal
- **WHEN** se envía el precio "350,50"
- **THEN** se interpreta como 350.50 y el servicio se guarda con ese precio

#### Scenario: Duración inválida
- **WHEN** se envía una duración de 0, negativa, con decimales o mayor a 720
- **THEN** no se guarda nada y se indica que la duración no es válida

#### Scenario: Se conservan los datos escritos
- **WHEN** un envío es rechazado por un campo inválido
- **THEN** el formulario sigue mostrando los valores que la administradora había escrito

### Requirement: Escrituras de servicios solo con sesión de administradora
Toda acción que cree, modifique, desactive o reactive un servicio SHALL verificar la sesión de administradora antes que cualquier otra cosa, y MUST fallar sin tocar la base cuando no hay sesión válida, aunque se la invoque directamente fuera de la interfaz.

#### Scenario: Acción invocada sin sesión
- **WHEN** se invoca la acción de crear, editar o cambiar el estado de un servicio sin sesión válida
- **THEN** la acción se rechaza como no autorizada y no se escribe ni se lee ningún dato del catálogo

#### Scenario: Administradora dada de baja
- **WHEN** una administradora cuya fila ya fue borrada de `usuario_admin` invoca una acción con una sesión aún vigente
- **THEN** la acción se rechaza como no autorizada
