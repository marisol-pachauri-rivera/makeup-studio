## Why

La clienta de una reserva confirmada que no puede asistir hoy solo puede escribirle al studio por WhatsApp, justo lo que el producto quiere evitar (PRD, criterio de éxito del 70%). Reprogramar desde su enlace, con 24 horas de anticipación y sin pagar de nuevo, cierra ese circuito.

## What Changes

- Nueva ruta pública `/reservas/<token>/reprogramar`: la clienta elige una maquilladora, un día y un horario libre para uno de sus turnos, ve un resumen "de X a Y" y confirma.
- Nueva operación de servidor que mueve el turno (inicio, fin y maquilladora de su línea) en una transacción: la reserva conserva estado, número de operación, monto y precio. Si el nuevo horario está ocupado, no cambia nada y el turno original queda intacto.
- Regla de 24 horas evaluada en el servidor sobre el turno original; la página de estado la refleja deshabilitando la acción pasado el plazo.
- El nuevo horario puede desplazar a una reserva vencida (vencimiento lazy, ADR 0003) mediante una variante de actualización de `insertarLineaLiberandoVencidas`.
- La disponibilidad del modo "reprogramar" no cuenta el propio turno como ocupado.
- Se reprograma **un turno (integrante) a la vez**; la reserva grupal sigue con un solo token, estado y monto.
- Sin migración ni cambios de esquema.

## Capabilities

### New Capabilities
- `booking-rescheduling`: reprogramar un turno de una reserva confirmada (plazo, elección del nuevo horario, atomicidad, idempotencia, carreras, rechazo sin pérdida del turno original).

### Modified Capabilities
- `booking-status-page`: se agrega el acceso a reprogramar por turno, habilitado o deshabilitado según el plazo.
- `booking-expiration`: se agrega que mover un turno también libera una reserva vencida que ocupe el destino.

## Impact

- Nuevos: `src/lib/reprogramacion/`, `src/app/reservas/[token]/reprogramar/`, componentes públicos de reprogramación y sus pruebas.
- Existentes modificados (aditivo): `src/app/reservas/[token]/page.tsx`, `src/lib/reserva/vencimiento.ts` (parámetro opcional para excluir una línea), `src/lib/disponibilidad/consulta.ts` (parámetro opcional análogo).
- Depende de #11 (estado `confirmada` y panel). ADR relacionados: 0003, 0004, 0005, 0006, 0009. Sin dependencias nuevas.
