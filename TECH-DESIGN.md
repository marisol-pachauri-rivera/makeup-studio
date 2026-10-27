# Technical Design Document: Studio de Maquillaje - Sistema de Reservas

**Tipo de proyecto:** Greenfield (sin repositorio ni código previo).
**Design.md disponible:** No — el modelo de datos se derivó solo del PRD.

## Resumen

Sistema de reservas online para un studio de maquillaje con varias maquilladoras, que reemplaza
la gestión manual de turnos por WhatsApp (ver `PRD.md`). La clienta elige servicio, maquilladora y
horario, reserva de forma individual o grupal, paga por QR de billetera electrónica ingresando el
número de operación, y consulta el estado en una página propia; el studio valida el pago desde un
panel administrativo. Se construye como un único monolito Next.js desplegado en Vercel free tier
con PostgreSQL en Neon.

**Cambios al PRD durante este diseño** (acordados con el usuario y ya reflejados en `PRD.md`):
se reemplazó la captura de comprobante por el número de operación; se quitaron el portafolio, el
bloqueo temporal de horarios previo a la reserva y los recordatorios por WhatsApp; se agregó el
vencimiento lazy a 20 minutos de reservas sin pago (ADR 0003); se agregaron el plazo mínimo de 24 h
para cancelar o reprogramar, la unicidad del número de operación y la posibilidad de cambiar
maquilladora al reprogramar.

## Arquitectura de componentes

Un solo componente desplegable, todo nuevo (ADR 0001):

- **Aplicación Next.js (TypeScript)**
  - *Sitio público*: catálogo de servicios, disponibilidad por maquilladora, asistente de reserva
    (estado en el cliente, ADR 0008), pantalla de pago con QR, página de estado de la reserva con
    enlace único (ADR 0004).
  - *Panel admin* (rutas protegidas, ADR 0007): ver reservas, validar pagos, cancelar reservas
    abandonadas, gestionar catálogo, maquilladoras y agenda.
  - *Capa de servidor*: Server Components para lecturas y Server Actions para escrituras,
    validadas con Zod (ADR 0006); acceso a datos con Drizzle (ADR 0002).
- **Neon PostgreSQL**: única persistencia; garantiza la no superposición de turnos mediante una
  restricción de exclusión (ADR 0003 y ADR 0005).
- **Vercel (Hobby)**: hosting. No hay cron, colas ni servicios externos de mensajería.

Interfaz con Tailwind y shadcn/ui (ADR 0010). Comunicación: navegador → Server Actions /
Server Components → Drizzle → Neon.

**Decisión omitida:** almacenamiento de archivos, porque el alcance no incluye comprobantes en
imagen ni portafolio.

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0001](adrs/0001-monolito-nextjs.md) | Monolito Next.js como única aplicación | Aceptado |
| [ADR-0002](adrs/0002-vercel-neon-drizzle.md) | Vercel free tier, Neon Postgres y Drizzle | Aceptado |
| [ADR-0003](adrs/0003-reserva-pendiente-ocupa-horario.md) | La reserva pendiente ocupa el horario y vence de forma lazy (20 min); sin bloqueo temporal ni cron | Aceptado |
| [ADR-0004](adrs/0004-notificacion-pagina-de-estado.md) | Confirmación mediante página de estado, sin envío saliente | Aceptado |
| [ADR-0005](adrs/0005-modelo-de-datos.md) | Modelo de datos con reserva y líneas de reserva | Aceptado |
| [ADR-0006](adrs/0006-server-actions.md) | Server Actions y Server Components como contrato | Aceptado |
| [ADR-0007](adrs/0007-autenticacion-admin.md) | Auth.js con usuario y contraseña para el panel | Aceptado |
| [ADR-0008](adrs/0008-estado-del-asistente-de-reserva.md) | Estado del asistente en cliente con sessionStorage | Aceptado |
| [ADR-0009](adrs/0009-resiliencia-y-errores.md) | Resiliencia y manejo de errores mínimos | Aceptado |
| [ADR-0010](adrs/0010-stack-de-interfaz.md) | Tailwind CSS y shadcn/ui | Aceptado |
| [ADR-0011](adrs/0011-framework-de-testing.md) | Vitest con PostgreSQL real en contenedor | Aceptado |
| [ADR-0012](adrs/0012-limite-de-intentos-de-login.md) | Límite de intentos de inicio de sesión persistido en PostgreSQL | Aceptado |

## Modelo de datos

Detalle y justificación en ADR-0005. Entidades y relaciones:

- `servicio` (nombre, descripción, precio, duración, activo)
- `maquilladora` (nombre, activa)
- `horario_trabajo` (maquilladora, día de semana, inicio, fin)
- `bloqueo_agenda` (maquilladora, rango de fecha y hora, motivo)
- `reserva` (token de acceso único, contacto de la clienta, estado, número de operación único,
  monto total, estado de reembolso, motivo de rechazo, motivo de cancelación, fechas)
- `reserva_linea` (reserva → N líneas; persona, servicio, maquilladora, inicio, fin, precio al
  reservar, `activa`)
- `usuario_admin` (credenciales con hash)
- `intento_login` (usuario normalizado, instante; solo intentos fallidos, ADR 0012)

Restricciones clave: exclusión por maquilladora y rango de tiempo sobre líneas activas;
`UNIQUE` en número de operación; reservas y líneas se crean en una sola transacción.
Estados de reserva: `pendiente_pago` → `pendiente_validacion` → `confirmada`; `cancelada` desde
cualquiera. Además, el studio puede rechazar el pago (`pendiente_validacion` → `pendiente_pago`):
se borra el número de operación (queda libre para ser usado de nuevo), se conserva el horario y se
guarda un motivo de rechazo visible para la clienta (ADR 0005). Una reserva en `pendiente_pago`
sin número de operación y con más de 20 minutos vence: se cancela (motivo `vencida`) de forma lazy
cuando otra clienta intenta tomar su horario (ADR 0003). Las reservas devueltas a `pendiente_pago`
por un rechazo no vencen.

## Criterios de aceptación por flujo

### Consulta de catálogo y disponibilidad

- [ ] El catálogo público lista solo servicios activos con nombre, precio y duración.
- [ ] Al elegir servicio y maquilladora, se muestran únicamente los horarios dentro de su
      `horario_trabajo`, que no coincidan con un `bloqueo_agenda` ni con una línea activa, y que
      alcancen para la duración del servicio.
- [ ] La clienta puede elegir cualquier maquilladora activa; el sistema nunca asigna una
      automáticamente.
- [ ] La consulta de disponibilidad no requiere cuenta de usuario.

### Reserva individual y grupal

- [ ] Una reserva individual crea una `reserva` en `pendiente_pago` con una línea activa, y el
      horario deja de mostrarse como disponible para otras clientas.
- [ ] Una reserva grupal con N personas crea una sola reserva con N líneas en una única
      transacción; si una línea choca, no se guarda ninguna.
- [ ] No se permite confirmar una reserva grupal si alguna persona no tiene nombre o servicio
      definido.
- [ ] Dos envíos simultáneos para el mismo horario y maquilladora: uno se crea y el otro recibe el
      mensaje "horario ya no disponible", conservando los datos ingresados.
- [ ] Un doble clic o reenvío del mismo formulario no crea reservas duplicadas.
- [ ] El monto total es la suma de los precios de las líneas al momento de reservar, y no cambia
      si el precio del catálogo se modifica después.
- [ ] Tras crear la reserva, la clienta recibe un enlace único con token no adivinable.

### Pago y validación

- [ ] La pantalla de pago muestra el QR y un campo de número de operación; no permite subir
      archivos.
- [ ] Al enviar un número de operación válido, la reserva pasa a `pendiente_validacion`.
- [ ] Un número de operación ya usado en otra reserva es rechazado con mensaje claro y no cambia
      el estado.
- [ ] Un número de operación vacío no modifica el estado; la reserva sigue en `pendiente_pago` y
      ocupa el horario.
- [ ] El panel lista las reservas en `pendiente_validacion` con número de operación, monto y
      datos de contacto.
- [ ] Al validar, el estado pasa a `confirmada` y la página de estado de la clienta lo refleja en
      la siguiente carga.
- [ ] Al cancelar una reserva (p. ej. una abandonada), sus líneas quedan inactivas y el horario
      vuelve a estar disponible.
- [ ] Una reserva en `pendiente_pago` sin número de operación y con más de 20 minutos no cuenta como
      ocupando el horario: la disponibilidad pública lo muestra libre.
- [ ] Si otra clienta reserva ese horario, la reserva vencida pasa a `cancelada` (motivo `vencida`),
      sus líneas quedan inactivas y la nueva reserva se crea, todo en una sola transacción.
- [ ] Si la reserva vencida recibe un número de operación justo durante ese intento, no se cancela y
      la segunda clienta recibe "horario ya no disponible".
- [ ] Si la clienta ingresa su número cuando su reserva ya fue cancelada por vencimiento, la acción se
      rechaza con un mensaje que lo explica; si nadie tomó el horario, el ingreso funciona.
- [ ] Una reserva devuelta a `pendiente_pago` por un rechazo de pago no vence automáticamente.
- [ ] La pantalla de pago muestra el plazo de 20 minutos.
- [ ] Al rechazar un pago en `pendiente_validacion` (número mal escrito, no coincide con la
      billetera u otro motivo), la reserva vuelve a `pendiente_pago`, el número de operación se borra
      y queda libre, las líneas siguen activas y el horario sigue ocupado.
- [ ] El rechazo exige un motivo, que la página de estado de la clienta muestra junto al campo para
      ingresar un nuevo número de operación.
- [ ] Tras un rechazo, la clienta puede ingresar un número de operación (el mismo corregido u otro)
      y la reserva pasa de nuevo a `pendiente_validacion`; el número anterior puede ser usado por
      otra reserva.
- [ ] Solo usuarios autenticados pueden validar, rechazar o cancelar desde el panel; la acción
      falla sin sesión válida aunque se invoque directamente.

### Cancelación y reprogramación

- [ ] La clienta puede cancelar o reprogramar desde su enlace solo si faltan 24 horas o más para
      el turno; pasado ese plazo la acción está deshabilitada y el servidor la rechaza.
- [ ] Al cancelar una reserva con pago validado, queda `cancelada` y con reembolso `pendiente`
      visible en el panel; el studio lo marca como `realizado`.
- [ ] Al cancelar, el horario vuelve a estar disponible.
- [ ] Al reprogramar se puede cambiar horario y maquilladora; la reserva conserva su número de
      operación y no pide nuevo pago.
- [ ] Una reprogramación a un horario ocupado es rechazada sin perder el turno original.

### Panel administrativo y agenda

- [ ] El acceso al panel exige inicio de sesión con usuario y contraseña; sin sesión redirige al
      login.
- [ ] Un intento de inicio de sesión repetido fallido queda limitado.
- [ ] El studio puede crear, editar y desactivar servicios y maquilladoras.
- [ ] El studio puede cargar horarios de trabajo y bloqueos de agenda por maquilladora, y estos se
      reflejan en la disponibilidad pública.
- [ ] El panel muestra la agenda por maquilladora con las reservas activas por día.

### Resiliencia

- [ ] Una consulta que falla por suspensión de Neon se reintenta de forma acotada antes de mostrar
      error.
- [ ] Los errores inesperados muestran una página amigable, sin detalles técnicos.
- [ ] Toda Server Action valida sus entradas con Zod y rechaza datos inválidos con mensaje claro.

## Riesgos técnicos abiertos

- **Términos de Vercel Hobby:** el plan es para uso personal no comercial y el studio es un
  negocio; puede ser necesario migrar a un plan de pago para producción (ADR 0002).
- **Reservas abandonadas:** vencen a los 20 minutos de forma lazy, pero alguien puede seguir
  creando muchas reservas sin pagar (no hay tope por teléfono ni rate limit), y una clienta que
  paga tarde puede perder el horario y requerir reembolso manual (ADR 0003).
- **Sin notificación proactiva:** la clienta debe volver a la página de estado; puede generar
  consultas por WhatsApp y erosionar el criterio de éxito del 70% (ADR 0004). Además, la demora
  de validación sigue sin tiempo máximo (riesgo principal del PRD).
- **Pérdida del enlace de reserva:** no hay forma automática de recuperarlo (ADR 0004).
- **Evidencia de pago débil:** sin comprobante, la validación depende de que el studio coteje el
  número de operación en su billetera; el mecanismo debe confirmarse con el studio (PRD).
- **Recuperación de contraseña admin manual** y alta de usuarios por intervención técnica
  (ADR 0007).
- **Límites del free tier de Neon** (almacenamiento, suspensión por inactividad) y de Vercel
  (duración de funciones).
- **Vista de agenda del panel:** shadcn/ui no incluye calendario por maquilladora; falta decidir
  si se compone a mano o con una librería (ADR 0010).
