# ADR 0009: Resiliencia y manejo de errores mínimos y proporcionados

## Estado

Aceptado

## Contexto

Los riesgos técnicos reales son pocos: el choque de horario al confirmar una reserva (ADR 0003 y
ADR 0008), la suspensión por inactividad de Neon en el free tier (ADR 0002), entradas inválidas
(número de operación mal escrito, grupo incompleto) y el doble envío del formulario de reserva. El
sistema no depende de pasarelas ni de servicios externos de mensajería (ADR 0003 y ADR 0004), por
lo que la resiliencia se concentra en la base de datos y en la validación.

## Decisión

- Cada creación o modificación de reserva se ejecuta en una transacción.
- El error de exclusión de Postgres se traduce en un mensaje claro de "horario ya no disponible",
  llevando a la clienta de vuelta al paso de horario con el resto de los datos conservados.
- Reintento automático acotado (pocos intentos con espera corta) ante fallos de conexión a Neon
  por suspensión.
- Idempotencia del envío mediante una clave generada por intento de reserva, para evitar
  reservas duplicadas por doble clic o reenvío.
- Validación de toda entrada con Zod (ADR 0006), con mensajes de error comprensibles.
- Páginas de error propias, sin mostrar errores técnicos a la clienta.
- Sin servicio de monitoreo de errores en esta versión.

## Alternativas consideradas

- **Lo anterior más Sentry (free tier)** — daría visibilidad y alertas de fallos en producción,
  pero agrega una dependencia y cuotas que el usuario prefirió no sumar en esta versión.
- **Valores por defecto de Next.js sin tratamiento especial** — cero esfuerzo, pero expone
  errores crudos a la clienta y deja abierto el riesgo de reservas duplicadas por doble clic.

## Consecuencias

- Cubre los riesgos reales con poco código y sin servicios adicionales.
- Sin monitoreo ni alertas, un fallo recurrente en producción se descubre cuando alguien del
  studio o una clienta lo reporta.
- Los reintentos contra Neon agregan latencia visible en la primera consulta tras un periodo
  inactivo, y no resuelven una caída prolongada de la base.
