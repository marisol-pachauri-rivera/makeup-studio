## ADDED Requirements

### Requirement: Inicio de sesión con usuario y contraseña
El sistema SHALL permitir iniciar sesión en el panel a una administradora registrada ingresando su nombre de usuario y su contraseña. Con credenciales correctas, el sistema MUST crear una sesión y llevar a la administradora al panel. El nombre de usuario MUST compararse sin distinguir mayúsculas ni espacios en los extremos.

#### Scenario: Credenciales correctas
- **WHEN** una administradora registrada envía su usuario y su contraseña correctos desde el login
- **THEN** se crea su sesión y llega a `/admin`

#### Scenario: Usuario con otras mayúsculas
- **WHEN** la administradora `Maria` envía `  maria ` con su contraseña correcta
- **THEN** el inicio de sesión tiene éxito

#### Scenario: Contraseña incorrecta
- **WHEN** se envía un usuario existente con una contraseña incorrecta
- **THEN** no se crea sesión y el login muestra un mensaje de credenciales inválidas

### Requirement: Errores que no revelan qué dato falló
El sistema SHALL responder igual (mismo mensaje, mismo código de estado y sin diferencias observables en el contenido) cuando el usuario no existe y cuando la contraseña es incorrecta. Los mensajes MUST NOT incluir detalles técnicos.

#### Scenario: Usuario inexistente
- **WHEN** se envía un usuario que no existe con cualquier contraseña
- **THEN** el login muestra el mismo mensaje de credenciales inválidas que ante una contraseña incorrecta

### Requirement: Validación de la entrada del login
El sistema SHALL validar en el servidor que el usuario y la contraseña sean texto no vacío antes de consultar la base, y MUST rechazar entradas vacías o de tipo inválido con un mensaje claro.

#### Scenario: Campos vacíos
- **WHEN** se envía el formulario de login con el usuario o la contraseña vacíos
- **THEN** no se consulta la base, no se crea sesión y se indica qué campo falta

### Requirement: Límite de intentos fallidos
El sistema SHALL limitar los intentos fallidos de inicio de sesión por nombre de usuario: tras 5 intentos fallidos dentro de una ventana de 15 minutos, MUST rechazar nuevos intentos para ese usuario, incluso con la contraseña correcta, hasta que el intento fallido más antiguo de la ventana salga de ella. Los intentos fallidos MUST contarse también para nombres de usuario que no existen. Un inicio de sesión exitoso MUST borrar los fallos acumulados de ese usuario.

#### Scenario: Quinto fallo seguido
- **WHEN** se envían 5 contraseñas incorrectas para un mismo usuario en menos de 15 minutos
- **THEN** el siguiente intento, aun con la contraseña correcta, es rechazado con un mensaje que indica que debe esperar

#### Scenario: Límite sobre usuario inexistente
- **WHEN** se envían 5 intentos fallidos para un usuario que no existe
- **THEN** los siguientes intentos para ese nombre reciben el mismo rechazo por límite, sin revelar que el usuario no existe

#### Scenario: Pasa la ventana
- **WHEN** pasan 15 minutos desde el intento fallido más antiguo de la ventana
- **THEN** el usuario puede volver a intentar iniciar sesión

#### Scenario: Éxito reinicia el conteo
- **WHEN** una administradora con 3 fallos acumulados inicia sesión correctamente
- **THEN** sus fallos se borran y un nuevo error cuenta como el primero

#### Scenario: Intento bloqueado no verifica la contraseña
- **WHEN** se rechaza un intento por límite
- **THEN** no se registra un fallo adicional ni se extiende el bloqueo

### Requirement: Cierre de sesión
El sistema SHALL permitir a la administradora cerrar su sesión desde el panel. Tras cerrarla, MUST NOT poder acceder a rutas ni acciones del panel con esa sesión.

#### Scenario: Cerrar sesión
- **WHEN** la administradora cierra su sesión y abre `/admin`
- **THEN** es redirigida al login

### Requirement: Alta de administradora por seed
El sistema SHALL ofrecer un script de línea de comandos para crear una administradora con su usuario y contraseña, guardando únicamente el hash de la contraseña. El script MUST rechazar un usuario ya existente sin modificarlo, MUST NOT escribir la contraseña en la salida y MUST exigir una longitud mínima de contraseña de 12 caracteres. No SHALL existir registro público de administradoras.

#### Scenario: Alta correcta
- **WHEN** se corre el script con un usuario nuevo y una contraseña de 12 o más caracteres
- **THEN** queda creada la administradora con la contraseña almacenada solo como hash y puede iniciar sesión

#### Scenario: Usuario existente
- **WHEN** se corre el script con un usuario que ya existe
- **THEN** el script falla con un mensaje claro y el hash existente no cambia

#### Scenario: Contraseña corta
- **WHEN** se corre el script con una contraseña de menos de 12 caracteres
- **THEN** el script falla sin crear la administradora

#### Scenario: Sin ruta de registro
- **WHEN** alguien intenta registrarse desde el sitio público o el panel
- **THEN** no existe pantalla ni acción que lo permita
