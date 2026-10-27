# ADR 0004: Confirmación mediante página de estado de la reserva, sin envío saliente

## Estado

Aceptado

## Contexto

El PRD pide notificar a la clienta cuando el studio valida el pago, y permitirle cancelar y
reprogramar desde la plataforma. Los recordatorios por WhatsApp salieron del alcance (ADR 0003),
por lo que hace falta definir el canal de la confirmación. El PRD no menciona cuentas de usuario
para las clientas. El despliegue en Vercel Hobby (ADR 0002) favorece evitar servicios externos
adicionales.

## Decisión

Cada reserva tiene una página de estado accesible mediante un enlace único con token no
adivinable. Esa página muestra el estado de la reserva (pendiente de pago, pendiente de
validación, confirmada, cancelada) y permite cancelar y reprogramar. No se envían emails ni
mensajes: la clienta consulta la página para saber si su pago fue validado.

## Alternativas consideradas

- **Email transaccional más página de estado** — aviso proactivo y enlace para gestionar la
  reserva; era la opción recomendada, pero suma un servicio externo y dominio con buena entrega
  que el usuario prefirió evitar. No fue elegida.
- **Solo email transaccional** — avisa pero no ofrece lugar propio para consultar ni gestionar
  la reserva.

## Consecuencias

- Sin dependencias de servicios de mensajería ni configuración de dominio de envío; menos costo
  y menos superficie de falla.
- La clienta no recibe aviso: debe volver a la página para ver si el pago fue validado. Esto
  puede generar consultas por WhatsApp al studio, en contra del criterio de éxito del 70% de
  reservas sin contacto, y además la demora de validación (riesgo principal del PRD) se vuelve
  más visible. El usuario decidió que no hay plazo máximo de validación en esta versión.
- El enlace con token es la única credencial de acceso a la reserva; si la clienta lo pierde no
  hay forma automática de recuperarlo (queda abierto cómo lo reobtiene).
- Quien tenga el enlace puede cancelar o reprogramar la reserva.
