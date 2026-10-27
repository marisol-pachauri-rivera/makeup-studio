## Why

Hoy la clienta que no puede asistir tiene que escribirle al studio por WhatsApp, justo lo que el sistema quiere evitar (PRD, criterio de éxito del 70%). El PRD y el `TECH-DESIGN.md` ya prometen cancelar desde el enlace con 24 horas de anticipación y un reembolso que el studio gestiona a mano; falta construirlo (ítem #12 del backlog, depende de #11).

## What Changes

- La página de estado (`/reservas/<token>`) ofrece "Cancelar reserva" mientras falten 24 horas o más para el primer turno; pasado el plazo el botón se deshabilita y la página dice que escriba al studio.
- Nueva Server Action pública que cancela la reserva completa (también un grupo) con motivo `clienta`, deja sus líneas inactivas (el horario se libera) y fija el estado de reembolso según el estado previo. La regla de las 24 h la decide el servidor, con la hora del studio (`America/Lima`) para mostrar el plazo.
- La cancelación es un `UPDATE` condicionado (estado y plazo) más la baja de líneas en una transacción; es idempotente y segura frente a validar o rechazar del studio (#11) en el mismo instante.
- La página explica el reembolso a la clienta (monto, que lo gestiona el studio, sin plazos prometidos) y muestra si está `pendiente` o `realizado`.
- Nueva sección del panel `/admin/reembolsos`: lista de reembolsos `pendiente` y acción "marcar como realizado" (con `requerirAdmin()`).
- Sin migración: el esquema ya tiene `estado_reembolso` y `motivo_cancelacion = clienta`.

Fuera de este change (no es #12): reprogramar (ítem #13), cancelar a una integrante suelta, pedir un motivo, notificaciones salientes.

## Capabilities

### New Capabilities
- `client-cancellation`: la clienta cancela su reserva completa desde el enlace con 24 h de anticipación; regla de plazo en servidor, atomicidad, idempotencia y carreras.
- `refund-tracking`: estado de reembolso de una reserva cancelada y su gestión en el panel (listar pendientes, marcar realizado).

### Modified Capabilities
- `booking-status-page`: agrega el control de cancelación, el plazo visible y el texto del reembolso (solo requisitos nuevos, sin tocar los existentes).

## Impact

- Código nuevo: `src/lib/cancelacion/`, `src/app/admin/(panel)/reembolsos/`.
- Código existente: `src/lib/reserva/estado.ts`, `src/app/reservas/[token]/page.tsx` y `actions.ts`, `src/components/publico/estado-de-reserva.tsx` (compartidos con #11 y #13).
- Sin dependencias nuevas ni migraciones. Sin endpoints REST (ADR 0006).
