# ADR 0008: Estado del asistente de reserva en el cliente con respaldo en sessionStorage

## Estado

Aceptado

## Contexto

El flujo de reserva tiene varios pasos previos a la creación de la reserva: servicio, maquilladora,
horario y, en reservas grupales, las personas con su servicio (el PRD exige definirlas todas antes
de reservar). La reserva se crea en la base recién al confirmar (ADR 0003 y ADR 0005). Hay que
decidir dónde vive el estado intermedio. La disponibilidad de horarios es dato del servidor y
cambia mientras la clienta completa el asistente. No hay cron para limpiar datos intermedios
(ADR 0003).

## Decisión

El estado del asistente vive en el cliente (React state), con respaldo en `sessionStorage` para
sobrevivir a una recarga de la página. Nada se escribe en la base hasta que la clienta confirma,
momento en que una única Server Action (ADR 0006) crea la reserva y sus líneas en una transacción
y revalida la disponibilidad. La fuente de verdad de la disponibilidad es siempre el servidor y la
restricción de exclusión de Postgres.

## Alternativas consideradas

- **Estado en la URL** — recargable y compartible, pero en grupos grandes produce URLs largas y
  exige serializar y validar el estado en cada paso.
- **Borrador persistido en el servidor (reserva en estado `borrador`)** — sobrevive a recargas y
  a cambios de dispositivo, pero agrega estados y filas intermedias y exige limpiar borradores
  abandonados, algo difícil sin tareas programadas.

## Consecuencias

- Implementación simple y sin filas intermedias en la base.
- La clienta puede ver como disponible un horario que otra tomó mientras completaba el asistente;
  el choque recién se detecta al confirmar y debe manejarse con un mensaje claro y volver al paso
  de horario conservando el resto de los datos.
- El respaldo en `sessionStorage` se pierde si cierra la pestaña o cambia de dispositivo; en un
  grupo grande esto implica volver a cargar a todas las personas.
