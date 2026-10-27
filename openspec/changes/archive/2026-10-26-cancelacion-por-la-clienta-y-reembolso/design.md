## Context

Ver `proposal.md`. Estado actual relevante: `reserva` ya tiene `estado_reembolso` (`no_aplica|pendiente|realizado`) y `motivo_cancelacion` (`vencida|clienta|studio`); los CHECK exigen motivo solo en `cancelada` y permiten conservar el número de operación al cancelar (hace falta para el reembolso). `obtenerReservaPorToken` no lee el reembolso ni calcula el plazo. El `UPDATE` condicionado ya es el patrón (`ingresarNumeroDeOperacion`, `liberarVencidasEnConflicto`). `/reservas/[token]` ya es `noindex` y las cabeceras de `next.config.ts` impiden cachearlo, así que no hay trabajo nuevo ahí (solo una prueba que lo mantenga).

El panel de reservas (lista, validar, rechazar) lo construye #11, que aún no existe; este change no depende de su código, solo de que `validar` y `rechazar` sean `UPDATE` condicionados al estado.

## Goals / Non-Goals

**Goals:** cancelar la reserva completa con la regla de 24 h en el servidor; reembolso coherente con el estado previo; gestión mínima del reembolso en el panel.

**Non-Goals:** reprogramar (#13); cancelar integrantes sueltas; motivo de cancelación escrito por la clienta; notificar al studio (no hay mensajería, ADR 0004); fecha/autor del "realizado" (sin migración).

## Decisions

1. **Un `UPDATE` con `CASE` para el reembolso.** `UPDATE reserva SET estado='cancelada', motivo_cancelacion='clienta', estado_reembolso = CASE estado WHEN 'pendiente_pago' THEN 'no_aplica' ELSE 'pendiente' END WHERE token=$1 AND estado IN (pendiente_pago, pendiente_validacion, confirmada) AND <primer turno activo >= ahora + 24 h> RETURNING id`. Con READ COMMITTED, si el studio valida o rechaza a la vez, Postgres reevalúa `WHERE` y el `CASE` sobre la versión confirmada: gana una operación y el reembolso refleja el estado final. Alternativa descartada: leer el estado y luego decidir el reembolso (carrera).
2. **Plazo con subconsulta en el mismo `UPDATE`.** `(SELECT min(inicio) FROM reserva_linea WHERE reserva_id = reserva.id AND activa) >= $ahora + interval '24 hours'`, con `ahora` pasado por quien llama (como `condicionVencida`), para pruebas deterministas. Las 24 h son una duración absoluta; la zona `America/Lima` solo se usa para mostrar la fecha límite (`aPartesLocales`).
3. **Transacción en serie.** Dentro de `db.transaction`: el `UPDATE` anterior y luego `UPDATE reserva_linea SET activa=false WHERE reserva_id = ...`. Si el primero no afecta filas, se hace una lectura fuera del `UPDATE` para explicar: `no_encontrada`, `ya_cancelada` (cualquier motivo; idempotente), `fuera_de_plazo`. Resultados: `cancelada | ya_cancelada | fuera_de_plazo | no_encontrada`.
4. **Doble clic.** Si la reserva ya está cancelada por `clienta`, se responde `cancelada` (éxito); si lo está por otro motivo, un aviso distinto sin cambios.
5. **Plazo en la lectura.** `obtenerReservaPorToken` suma `estadoReembolso` y `puedeCancelarHasta` (primer turno activo menos 24 h). La vista compara con el `ahora` de la página (tomado después de `params`, regla de `cacheComponents`) para deshabilitar el botón; el servidor decide siempre.
6. **Panel en sección propia.** `/admin/reembolsos` con su capa de datos (`src/lib/cancelacion/reembolsos.ts`, base inyectada), `procesar*` puro y acción con `requerirAdmin()`. Marcar es `UPDATE ... SET estado_reembolso='realizado' WHERE id=$1 AND estado_reembolso='pendiente'`; si no afecta filas, se distingue ya `realizado` (éxito) de `no_aplica`/inexistente (rechazo). Así no se reescribe la lista de #11; esta solo puede mostrar el estado de reembolso y enlazar aquí.
7. **Interfaz.** Botón con confirmación en dos pasos en el cliente (componente de formulario con `useActionState`, `refresh()` al éxito); el texto del reembolso usa `montoTotal` y no promete plazos.

## Risks / Trade-offs

- [Reloj de la app vs. base] → se usa el reloj del servidor de la app, sesgo de segundos despreciable frente a 24 h (igual que el vencimiento).
- [Quien tenga el enlace puede cancelar] → es el modelo de ADR 0004; el reembolso solo se hace tras el panel, que ve el número de operación.
- [Reserva cancelada tras rechazo de pago] → queda `no_aplica` aunque la clienta pudo haber pagado antes; lo ve el studio en su billetera.
- [Choque de archivos con #11 y #13] → los compartidos se tocan solo para agregar campos y una sección; ver tareas 3.x.

## Migration Plan

Sin migración ni cambios de esquema. Rollback: revertir el código; las reservas ya canceladas conservan datos válidos.

## Supuestos y preguntas abiertas

Supuestos (se aplican, a confirmar):
- Pedir confirmación antes de cancelar: sí, en el cliente (el servidor no la exige).
- No se pide motivo; el motivo es `clienta` fijo.
- El texto de reembolso dice monto y que el studio lo gestiona, sin plazo.
- Una reserva activa siempre tiene líneas activas; si por un fallo no las tuviera, el plazo no se cumple y la cancelación se rechaza como `fuera_de_plazo`.

Preguntas abiertas:
1. **`pendiente_validacion`:** ¿el reembolso es `pendiente`? Se asumió `pendiente` (la clienta informó un pago que el studio aún no validó); si el studio prefiere `no_aplica` hasta validar, cambia solo el `CASE` y un escenario de `refund-tracking`. No está resuelto.
2. ¿Qué hace el panel con un reembolso `pendiente` cuyo pago no se encuentra en la billetera? Por ahora puede marcarse `realizado`, sin estado "descartado" (requeriría un valor nuevo del enum y migración).
3. ¿Hace falta registrar quién y cuándo marcó el reembolso? Hoy no (sin migración).
4. PRD: el `REVISAR` sobre el plazo de 20 minutos reduce los pagos con reserva vencida pero **no** genera reembolso automático aquí (la vencida queda `no_aplica`); un pago tardío se gestiona fuera del sistema. No hay `REVISAR` del PRD que bloquee este ítem.
