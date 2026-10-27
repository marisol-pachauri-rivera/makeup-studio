# ADR 0003: La reserva pendiente ocupa el horario y vence de forma lazy; sin bloqueo temporal ni tareas programadas

## Estado

Aceptado. Actualizado: se agregó el vencimiento lazy de reservas `pendiente_pago` (antes se
descartaba por creer que requería cron) y el PRD fue modificado en consecuencia. Confirmado por el
usuario: el plazo de 20 minutos es suficiente y no se fija un tope de reservas sin pagar por
persona o teléfono en esta versión.

## Contexto

El PRD original pedía un bloqueo temporal de 10-15 minutos al elegir horario y maquilladora, con
liberación automática, y recordatorios de turno por WhatsApp. Vercel Hobby (ADR 0002) solo
permite cron diario, lo que hacía inviable un job frecuente de liberación. El usuario decidió
quitar del alcance el bloqueo temporal y los recordatorios de WhatsApp (el PRD fue actualizado en
consecuencia). Sin bloqueo temporal hay que definir cómo se resuelve el conflicto de dos clientas
que quieren el mismo horario con la misma maquilladora.

## Decisión

Al crear la reserva (aún sin número de operación) queda en estado "pendiente de pago" y ocupa el
horario de la maquilladora. Una restricción en Postgres (exclusión por maquilladora y rango de
tiempo sobre líneas activas, ADR 0005) impide que dos reservas activas se solapen; la segunda
clienta recibe un aviso de que el horario ya no está disponible.

**Vencimiento lazy.** Una reserva en `pendiente_pago` sin número de operación y con más de 20 minutos
desde su creación (plazo inicial, constante configurable) se considera vencida:

1. Si el insert de una nueva reserva choca con la restricción de exclusión, la aplicación busca la
   línea en conflicto. Si pertenece a una reserva vencida, la cancela (estado `cancelada`, motivo
   `vencida`, líneas inactivas) con un `UPDATE` condicionado a que siga en `pendiente_pago`, sin
   número de operación y vencida, y reintenta el insert, todo en la misma transacción. Si el
   `UPDATE` no afecta filas (la clienta original pagó justo en ese momento), no hay reintento y la
   segunda clienta recibe "horario no disponible".
2. La consulta de disponibilidad trata como libres las líneas de reservas vencidas, para que el
   horario no se muestre ocupado cuando en realidad se liberaría al intentar reservarlo.
3. Si la clienta original ingresa su número de operación y su reserva ya fue cancelada por
   vencimiento, la acción se rechaza con un mensaje que lo explica. Si nadie tomó el horario, la
   reserva sigue en `pendiente_pago` y el ingreso funciona.
4. Las reservas que volvieron a `pendiente_pago` por un rechazo de pago (ADR 0005) no vencen: la
   clienta probablemente ya pagó y la resuelve el studio.

El studio puede además cancelar manualmente desde el panel en cualquier momento. El sistema no
incluye tareas programadas (cron) en esta versión.

## Alternativas consideradas

- **Reserva y número de operación en un solo paso; gana quien confirma primero** — no deja
  reservas sin pagar ocupando agenda y no requiere liberación manual, pero la clienta puede pagar
  por QR y descubrir al enviar que el horario se lo llevó otra, lo que exige un reembolso manual.
  No fue elegida por el usuario.
- **Expiración con `expires_at` y cron diario de limpieza** — descartada: el cron diario de Hobby
  no libera con precisión. La versión lazy (sin cron) es la que se adoptó arriba.
- **Sin vencimiento, solo cancelación manual** — era la decisión original; deja a una reserva
  abandonada trabando el horario hasta que el studio la cancele. Reemplazada por el vencimiento lazy.
- **Job externo frecuente o Vercel Pro** — liberarían bloqueos con precisión, pero agregan una
  pieza externa o rompen la restricción de free tier.

## Consecuencias

- La clienta tiene el horario asegurado mientras paga, y el conflicto por el mismo horario queda
  resuelto por la base de datos y no por la aplicación.
- El PRD queda sin cron ni integraciones salientes de mensajería, lo que simplifica el despliegue
  en Vercel Hobby y elimina el riesgo abierto de WhatsApp Business API.
- Una reserva abandonada ya no traba el horario indefinidamente, pero el horario se libera solo
  si otra clienta intenta tomarlo; la reserva vencida sigue figurando en el panel como
  `pendiente_pago` hasta entonces.
- Una clienta que paga después de los 20 minutos puede encontrar su horario tomado por otra y haber
  pagado sin reserva: queda un reembolso manual para el studio. Con 20 minutos este caso es más
  probable que con un plazo largo (pagar con la billetera y copiar el número lleva varios
  minutos). Se mitiga mostrando el plazo en la pantalla de pago.
- La lógica de conflicto se vuelve más compleja (cancelar y reintentar dentro de la transacción,
  con una carrera contra el ingreso del número de operación) y debe probarse con Postgres real.
- Una persona mal intencionada sigue pudiendo ocupar horarios creando reservas que nunca paga: el
  vencimiento solo limita el tiempo, no la cantidad. El usuario decidió aceptar este riesgo: no
  hay tope por teléfono en esta versión (un tope sería la mitigación si se vuelve un problema).
