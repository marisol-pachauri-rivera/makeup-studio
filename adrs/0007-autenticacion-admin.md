# ADR 0007: Autenticación del panel con Auth.js, usuario y contraseña

## Estado

Aceptado

## Contexto

El panel administrativo expone datos de clientas y permite validar pagos, cancelar reservas y
gestionar la agenda, por lo que debe estar protegido. Los usuarios son pocas personas del studio.
Las clientas no tienen cuenta (ADR 0004). No hay envío saliente de emails (ADR 0004) y todo corre
en Vercel Hobby (ADR 0002). La tabla `usuario_admin` ya existe en el modelo (ADR 0005).

## Decisión

Auth.js con proveedor de credenciales (usuario y contraseña) contra la tabla `usuario_admin`,
con contraseñas almacenadas con hash (argon2 o bcrypt) y sesión en cookie. Las rutas del panel y
todas sus Server Actions (ADR 0006) exigen sesión admin válida. Los usuarios admin se crean de
forma manual (script o semilla), sin registro público.

## Alternativas consideradas

- **Auth.js con Google (lista de emails autorizados)** — evita guardar y resetear contraseñas,
  pero obliga a configurar OAuth y depender de cuentas de Google. No fue elegida por el usuario.
- **Sesión propia con cookie firmada hecha a mano** — mínimas dependencias, pero implica
  implementar a mano sesiones, expiración y protección contra fuerza bruta, con más riesgo de
  errores de seguridad.

## Consecuencias

- Solución estándar y mantenida, sin dependencia de un proveedor externo de identidad.
- Sin email no hay recuperación de contraseña automática: un olvido se resuelve manualmente
  por quien administra la base de datos.
- El sistema guarda contraseñas, lo que exige hash correcto y límite de intentos de inicio de
  sesión; un error acá expone el panel.
- Sin registro público, dar de alta o baja a una persona del studio requiere intervención técnica.
