## ADDED Requirements

### Requirement: Rutas del panel protegidas
El sistema SHALL exigir una sesión de administradora válida para toda ruta bajo `/admin`, excepto la pantalla de login. Sin sesión válida, MUST redirigir al login y, tras iniciar sesión, llevar a la ruta que se pidió originalmente solo si es una ruta interna del panel.

#### Scenario: Sin sesión
- **WHEN** una visitante sin sesión abre `/admin` o cualquier ruta bajo `/admin`
- **THEN** es redirigida al login y no ve contenido del panel

#### Scenario: Con sesión
- **WHEN** una administradora con sesión válida abre `/admin`
- **THEN** ve el panel

#### Scenario: Login estando ya autenticada
- **WHEN** una administradora con sesión válida abre el login
- **THEN** es llevada al panel

#### Scenario: Redirección a destino externo
- **WHEN** el login recibe como destino posterior una URL externa o que no pertenece a `/admin`
- **THEN** tras iniciar sesión se la lleva a `/admin`, nunca al destino externo

### Requirement: Sesión verificada en cada Server Action del panel
Toda Server Action del panel SHALL verificar en el servidor que existe una sesión de administradora válida antes de leer o escribir datos, y MUST fallar sin efectos cuando no la hay, aunque se la invoque directamente sin pasar por la interfaz. La protección de rutas MUST NOT considerarse suficiente por sí sola.

#### Scenario: Acción sin sesión
- **WHEN** se invoca directamente una Server Action del panel sin sesión válida
- **THEN** la acción falla con un error de no autorizada y no modifica ni devuelve datos

#### Scenario: Acción con sesión
- **WHEN** se invoca una Server Action del panel con sesión válida
- **THEN** la acción continúa con su lógica normal

#### Scenario: Sesión cerrada
- **WHEN** se invoca una Server Action del panel con una cookie de una sesión ya cerrada o expirada
- **THEN** la acción falla como no autorizada

### Requirement: Sesión que sigue a la base de datos
El sistema SHALL tratar la sesión como inválida si la administradora a la que pertenece ya no existe en `usuario_admin`, de modo que dar de baja a una persona corte su acceso sin esperar a que expire la cookie.

#### Scenario: Administradora dada de baja
- **WHEN** se borra una administradora que tenía una sesión abierta y esa sesión intenta abrir `/admin` o invocar una acción
- **THEN** es tratada como no autenticada

### Requirement: Sesión con vigencia acotada
El sistema SHALL emitir sesiones en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción, con una vigencia máxima de 8 horas sin renovación indefinida.

#### Scenario: Sesión vencida
- **WHEN** pasan más de 8 horas desde el inicio de sesión
- **THEN** la sesión deja de ser válida y se exige iniciar sesión de nuevo

### Requirement: Páginas del panel fuera de caché compartida
El sistema SHALL servir las páginas del panel y la pantalla de login sin ser almacenables en caché compartida y MUST NOT indexarse por buscadores.

#### Scenario: Encabezados
- **WHEN** se solicita una página del panel o el login
- **THEN** la respuesta indica que no se almacena en caché compartida y que no se indexe
