# admin-daily-agenda Specification

## Purpose

Mostrar a la administradora, por día y por maquilladora, qué horario trabaja, qué bloqueos tiene y qué turnos tiene reservados, en la hora local del studio y sin posibilidad de modificar nada desde esa vista.

## ADDED Requirements

### Requirement: Agenda del día por maquilladora
El sistema SHALL mostrar en `/admin/agenda`, para la fecha elegida, una sección por cada maquilladora activa y por cada inactiva con turnos activos ese día, con su horario de trabajo, sus bloqueos y sus turnos activos ordenados por hora de inicio.

#### Scenario: Día con turnos
- **WHEN** una maquilladora trabaja de 09:00 a 18:00 y tiene dos turnos activos ese día
- **THEN** su sección muestra el horario y los dos turnos en orden de hora

#### Scenario: Día sin horario
- **WHEN** la maquilladora no tiene tramos para ese día de la semana
- **THEN** su sección indica que no trabaja ese día y muestra igualmente cualquier turno activo que tenga

#### Scenario: Maquilladora inactiva sin turnos
- **WHEN** una maquilladora inactiva no tiene turnos activos ese día
- **THEN** no aparece en la agenda

### Requirement: Solo turnos activos
La agenda SHALL mostrar únicamente líneas con `activa = true`. Una reserva cancelada MUST NOT aparecer, y cada persona de una reserva grupal aparece como un turno propio.

#### Scenario: Reserva cancelada
- **WHEN** una reserva fue cancelada y sus líneas están inactivas
- **THEN** sus turnos no aparecen en la agenda

#### Scenario: Reserva grupal
- **WHEN** una reserva tiene tres personas con la misma maquilladora
- **THEN** la agenda muestra tres turnos, cada uno con el nombre de su persona

### Requirement: Datos de cada turno
Cada turno SHALL mostrar persona, servicio, hora de inicio y de fin en hora de Lima, estado de la reserva escrito, y nombre y teléfono de contacto de la reserva.

#### Scenario: Turno confirmado
- **WHEN** hay un turno de 10:00 a 11:00 de una reserva confirmada
- **THEN** se ve "10:00 a 11:00", el servicio, la persona, el estado "Confirmada" y el contacto

#### Scenario: Horas en hora de Lima
- **WHEN** un turno empieza a las 15:00 UTC
- **THEN** se muestra como 10:00, sin depender de la zona del servidor ni del navegador

### Requirement: Reserva vencida distinguida
Un turno de una reserva en `pendiente_pago`, sin número de operación, sin motivo de rechazo y creada hace más de 20 minutos SHALL seguir mostrándose y MUST marcarse con el texto "Plazo vencido", con la misma definición de vencimiento que usa la disponibilidad pública.

#### Scenario: Pendiente de pago vencida
- **WHEN** una reserva sin pago supera los 20 minutos y nadie tomó su horario
- **THEN** su turno aparece con el estado "Pendiente de pago" y la marca "Plazo vencido"

#### Scenario: Rechazo de pago no vence
- **WHEN** una reserva volvió a `pendiente_pago` por un rechazo
- **THEN** su turno no lleva la marca "Plazo vencido"

### Requirement: Bloqueos del día
La agenda SHALL mostrar, con su motivo y su rango en hora de Lima, cada bloqueo de la maquilladora que se solape con el día elegido, incluidos los que cruzan la medianoche.

#### Scenario: Bloqueo que cruza la medianoche
- **WHEN** un bloqueo va de las 22:00 del lunes a las 08:00 del martes
- **THEN** aparece en la agenda del lunes y en la del martes

### Requirement: Fecha en la URL tolerante
La fecha SHALL leerse de `?fecha=YYYY-MM-DD` y validarse con Zod. Si falta, es inválida, no existe en el calendario o viene repetida, el sistema MUST mostrar hoy en hora de Lima sin error.

#### Scenario: Sin fecha
- **WHEN** se abre `/admin/agenda` sin parámetros
- **THEN** se muestra el día de hoy en hora de Lima

#### Scenario: Fecha inválida
- **WHEN** se abre `/admin/agenda?fecha=2026-02-30`
- **THEN** se muestra hoy, sin página de error

#### Scenario: Borde de día en Lima
- **WHEN** son las 03:00 UTC del 25/12
- **THEN** "hoy" es el 24/12

### Requirement: Navegación entre días
La pantalla SHALL ofrecer enlaces al día anterior, al siguiente y a hoy, una franja con los siete días (lunes a domingo) de la semana de la fecha mostrada, y un selector de fecha que funcione sin JavaScript.

#### Scenario: Día siguiente
- **WHEN** la administradora pulsa "Siguiente" estando en el 10/03
- **THEN** va a `/admin/agenda?fecha=2026-03-11`

#### Scenario: Selector de fecha
- **WHEN** elige una fecha en el selector y lo envía
- **THEN** la pantalla muestra esa fecha

### Requirement: Vista de solo lectura con sesión
La pantalla SHALL exigir sesión de administradora, MUST NOT definir Server Actions de escritura y no modifica datos al abrirse.

#### Scenario: Sin sesión
- **WHEN** una visitante sin sesión abre `/admin/agenda`
- **THEN** es redirigida al login

#### Scenario: Sin acciones
- **WHEN** se revisan los archivos bajo `src/app/admin/(panel)/agenda/`
- **THEN** no hay `actions.ts` ni directiva de Server Action

### Requirement: Legible en el celular sin depender del color
La agenda SHALL poder usarse en pantallas estrechas sin desplazar horizontalmente la página, y todo estado MUST distinguirse por texto, no solo por color.

#### Scenario: Estados con texto
- **WHEN** hay turnos pendientes y confirmados
- **THEN** cada uno muestra su estado escrito
