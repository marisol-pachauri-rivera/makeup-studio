## Purpose

Mostrar a cualquier visitante el catálogo de servicios del studio con su precio y duración, y permitirle elegir una maquilladora, sin crear cuenta y sin que el sistema decida por ella.

## ADDED Requirements

### Requirement: Catálogo público de servicios activos
La portada del sitio SHALL listar, sin requerir sesión ni cuenta, únicamente los servicios activos, cada uno con su nombre, su descripción, su precio y su duración en minutos. Los servicios inactivos MUST NOT aparecer. Cada servicio MUST ofrecer un acceso a la consulta de sus horarios.

#### Scenario: Solo servicios activos
- **WHEN** existen un servicio activo y uno inactivo y una visitante abre la portada
- **THEN** ve el servicio activo con nombre, precio y duración, y no ve el inactivo

#### Scenario: Precio exacto
- **WHEN** un servicio cuesta 350.50
- **THEN** la portada lo muestra como 350.50, sin redondeos ni pérdida de decimales

#### Scenario: Servicio sin descripción
- **WHEN** un servicio activo tiene la descripción vacía
- **THEN** se muestra igual, sin un espacio vacío ni la palabra "undefined"

#### Scenario: Sin servicios activos
- **WHEN** no hay ningún servicio activo
- **THEN** la portada indica que por ahora no hay servicios disponibles y no ofrece ninguna reserva

#### Scenario: Sin cuenta
- **WHEN** una visitante sin sesión abre la portada
- **THEN** ve el catálogo completo y no es llevada a ningún inicio de sesión

### Requirement: Elección de la maquilladora
La pantalla de disponibilidad de un servicio SHALL mostrar todas las maquilladoras activas y permitir elegir cualquiera de ellas. El sistema MUST NOT elegir ni preseleccionar una maquilladora por la clienta. Las maquilladoras inactivas MUST NOT ofrecerse.

#### Scenario: Todas las activas
- **WHEN** hay tres maquilladoras activas y una inactiva
- **THEN** la pantalla ofrece las tres activas por su nombre y no ofrece la inactiva

#### Scenario: Sin preselección
- **WHEN** la clienta abre la pantalla de disponibilidad de un servicio sin haber elegido maquilladora
- **THEN** no se muestra ningún horario y se le pide elegir una

#### Scenario: Sin maquilladoras activas
- **WHEN** no hay ninguna maquilladora activa
- **THEN** la pantalla indica que por ahora no hay maquilladoras disponibles

### Requirement: Servicio o maquilladora no ofrecibles
Pedir la disponibilidad de un servicio que no existe, está inactivo o tiene un identificador inválido SHALL responder "no encontrado" sin mostrar datos. Pedirla con una maquilladora inexistente, inactiva o con un identificador inválido SHALL tratarse como si no se hubiera elegido maquilladora y MUST NOT mostrar sus horarios.

#### Scenario: Servicio inactivo por enlace directo
- **WHEN** se abre el enlace de disponibilidad de un servicio inactivo
- **THEN** se responde "no encontrado"

#### Scenario: Servicio inexistente o inválido
- **WHEN** se abre el enlace con el identificador 9999 inexistente o con `abc`
- **THEN** se responde "no encontrado"

#### Scenario: Maquilladora inactiva por enlace directo
- **WHEN** se pide la disponibilidad con una maquilladora inactiva
- **THEN** no se muestran sus horarios y se pide elegir una de las activas
