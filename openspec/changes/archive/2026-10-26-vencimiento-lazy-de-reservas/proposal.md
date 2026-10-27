## Why

Hoy una reserva `pendiente_pago` que nunca se paga ocupa su horario para siempre: la disponibilidad pública la trata como ocupada y la exclusión de Postgres rechaza cualquier línea solapada, y no hay cron (ADR 0002) ni panel todavía (#11) que la libere. El ADR 0003 y el PRD definen el vencimiento lazy: pasados 20 minutos sin número de operación la reserva deja de ocupar y se cancela cuando otra clienta intenta tomar ese horario. Es el ítem #8 del backlog y desbloquea el pago (#10), que debe rechazar el número si la reserva ya venció.

## What Changes

- Definir "reserva vencida": en `pendiente_pago`, sin número de operación, sin motivo de rechazo y con más de 20 minutos desde `creada_en` (constante configurable; las devueltas por un rechazo no vencen).
- La disponibilidad pública trata como libres las líneas de reservas vencidas, sin tocar `calcularHuecos`.
- Al crear una reserva, si el insert de la línea choca con la exclusión, se busca la línea en conflicto; si es de una reserva vencida se cancela (`cancelada`, motivo `vencida`, líneas inactivas) con un `UPDATE` condicionado a que siga vencida, y se reintenta el insert, todo en la misma transacción. Si el `UPDATE` no afecta filas (la clienta original pagó justo entonces) no hay reintento y la segunda recibe "horario no disponible".
- La cancelación por vencimiento y el insert con liberación se exponen como piezas reutilizables para que la reserva grupal (#9) las use por línea.
- Pruebas de integración con Postgres real, incluida la carrera contra el ingreso del número de operación (que aún no existe, #10) simulada con una segunda conexión.
- Sin tope de reservas sin pagar por teléfono (decisión aceptada en el ADR 0003).

## Capabilities

### New Capabilities
- `booking-expiration`: regla de vencimiento, cancelación lazy de reservas vencidas al chocar y carrera contra el ingreso del número de operación.

### Modified Capabilities
- `slot-availability`: las líneas de reservas vencidas no ocupan horario.
- `individual-booking`: el choque con una reserva vencida se resuelve a favor de la nueva reserva dentro de la misma transacción.

## Impact

- Código: `src/lib/disponibilidad/consulta.ts` (filtro de vencidas), `src/lib/reserva/crear.ts` (liberar y reintentar), módulo nuevo `src/lib/reserva/vencimiento.ts` y constante del plazo.
- Sin cambios de esquema ni migraciones: `motivo_cancelacion = 'vencida'`, `creada_en` y los CHECK ya existen.
- Sin cambios de UI. Una reserva vencida sigue figurando `pendiente_pago` en la página de estado y el panel hasta que otra clienta tome su horario (ADR 0003); la pantalla de pago y el rechazo del número son del #10.
- Coordinación con #9 (reserva grupal), que también modifica `crear.ts`.
