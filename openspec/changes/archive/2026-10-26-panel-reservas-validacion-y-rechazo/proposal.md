# Proposal

## Why

Hoy una reserva que la clienta informó como pagada (`pendiente_validacion`) no tiene salida: el studio no tiene dónde verla, cotejar el número de operación con su billetera ni confirmarla o devolverla. Es la única intervención humana del flujo (PRD) y el riesgo principal del proyecto; sin este ítem ninguna reserva llega a `confirmada` y el panel no puede cancelar reservas abandonadas.

## What Changes

- Sección `/admin/reservas` del panel: lista paginada de reservas con estado, contacto (nombre y teléfono), número de operación, monto, primer turno y estado de reembolso, con los pendientes de validación primero y las más antiguas arriba.
- Detalle `/admin/reservas/<id>` con los turnos de cada persona y las acciones permitidas según el estado.
- **Validar**: `pendiente_validacion` → `confirmada`, guarda `validada_en`.
- **Rechazar con motivo obligatorio**: `pendiente_validacion` → `pendiente_pago` en un solo `UPDATE`: borra el número (queda libre), guarda el motivo y conserva las líneas activas (el horario sigue ocupado). Una reserva rechazada no vence.
- **Cancelar manualmente** desde cualquier estado no cancelado: `cancelada` con motivo `studio` y líneas inactivas (el horario se libera); si estaba confirmada deja el reembolso en `pendiente`.
- La página de estado de la clienta muestra el motivo del rechazo junto al formulario del número (hoy no lo devuelve a propósito).
- Las tres acciones son Server Actions que verifican la sesión primero, validan con Zod y usan `UPDATE` condicionado al estado esperado, seguras frente al ingreso del número (#10) y al vencimiento (#8).
- Sin migración: el esquema ya tiene `motivo_rechazo`, `validada_en`, `estado_reembolso` y los `CHECK` necesarios.

## Capabilities

### New Capabilities
- `admin-booking-list`: lista y detalle de reservas en el panel, con orden, paginación, filtro por estado y datos de contacto y reembolso.
- `payment-validation`: validar o rechazar con motivo el pago de una reserva en `pendiente_validacion`.
- `admin-booking-cancellation`: cancelación manual de una reserva desde el panel y su efecto en horario y reembolso.

### Modified Capabilities
- `booking-status-page`: la página muestra el motivo del rechazo del pago junto al formulario del número de operación.

## Impact

- Código nuevo: `src/lib/reservas-panel/` (lectura, transiciones, esquemas, formularios) y `src/app/admin/(panel)/reservas/` (páginas, acciones, formularios).
- Código existente: el menú del panel (`src/components/panel/navegacion.tsx`, compartido con #14) y la lectura y vista de la página de estado (`src/lib/reserva/estado.ts`, `src/components/publico/estado-de-reserva.tsx` y `seccion-de-pago.tsx`, compartidos con #12 y #13).
- Sin dependencias nuevas, sin migración, sin cron ni mensajería (ADR 0003 y 0004). Deja a #12 el marcado del reembolso como `realizado`.
