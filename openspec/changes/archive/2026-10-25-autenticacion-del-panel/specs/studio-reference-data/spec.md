## ADDED Requirements

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
