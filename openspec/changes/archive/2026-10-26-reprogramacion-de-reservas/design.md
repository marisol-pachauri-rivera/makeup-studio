## Context

Ver `proposal.md`. Estado de partida: la página `/reservas/[token]` es pública y sus cabeceras (`/reservas/:path*`) ya impiden cachear, indexar y enviar el enlace como referencia, así que una subruta las hereda. `reserva_linea` tiene la exclusión `reserva_linea_sin_solapamiento` (por maquilladora, rango semiabierto, solo `activa`); un `UPDATE` de una línea no choca con su propia versión anterior. `insertarLineaLiberandoVencidas` solo inserta; `liberarVencidasEnConflicto` cuenta como bloqueante toda línea en conflicto que no esté vencida, incluida la propia línea que se mueve. `consultarDisponibilidad` cuenta la línea propia como ocupada. Un cliente de transacción de `pg` no admite consultas en paralelo. No hace falta migración.

## Goals / Non-Goals

**Goals:**
- Mover un turno de una reserva `confirmada` sin tocar pago, estado ni monto, y sin poder perder nunca el turno original.
- Misma seguridad que la reserva: exclusión de Postgres como garantía final, `23P01`/`40P01` = "horario ya no disponible", vencimiento lazy.

**Non-Goals:** cambiar de servicio; reprogramar una reserva no confirmada; aprobación del studio; reprogramar desde el panel; historial o tope de reprogramaciones; notificaciones; cancelar una integrante suelta.

## Decisions

1. **Un turno (línea) a la vez.** La reserva grupal sigue con un token, estado y monto; cada integrante tiene su "Reprogramar". Alternativa descartada: mover la reserva completa, porque obliga a actualizar varias líneas y un intercambio entre integrantes (A pasa al horario de B y B al de A, misma maquilladora) chocaría transitoriamente con la exclusión según el orden.
2. **Selección en la URL, no en `sessionStorage`.** Ruta nueva `/reservas/[token]/reprogramar?linea=<id>&maquilladora=<id>&fecha=<YYYY-MM-DD>&inicio=<ISO>`; reutiliza `leerParametros`. No se toca el asistente (`asistente.ts`), así la reserva individual y grupal no se alteran (ADR 0008 solo cubre el asistente de reserva). Elegir un horario es un enlace; el resumen "de X a Y" tiene un formulario de confirmación (Server Action con `useActionState`, botón deshabilitado mientras envía). Tras el éxito: `redirect` a `/reservas/<token>`.
3. **El identificador del turno es el id de `reserva_linea`**, no la posición (el orden cambia al reprogramar). La acción lo valida contra el token en la misma sentencia. Para listarlos con id sin tocar `estado.ts` ni `estado-de-reserva.tsx`, un módulo propio (`obtenerTurnosReprogramables(db, token, ahora)`) devuelve id, inicio, fin, maquilladora y `puedeReprogramar`; `page.tsx` agrega una sección propia debajo de la vista.
4. **Duración = `fin - inicio` de la línea**, no la del servicio actual (el catálogo pudo cambiar, y el servicio puede estar inactivo). El nuevo fin es inicio + esa duración. `calcularHuecos` recibe esa duración.
5. **Disponibilidad sin el propio turno:** `consultarDisponibilidad` recibe un parámetro opcional `ignorarLineaId`; sin él se comporta igual. Alternativa: aceptar que el propio horario no se ofrezca, lo que impediría mover 30 minutos.
6. **Plazo:** `inicio_original - ahora >= 24 h` en milisegundos con el `ahora` inyectado (el reloj solo se lee tras una API de petición). Son instantes absolutos: la zona del studio solo afecta cómo se muestra (Lima no tiene horario de verano). Constante `ANTICIPACION_MINIMA_HORAS = 24` en `src/lib/reprogramacion/plazo.ts`.
7. **Transacción y bloqueo:** fuera de la transacción: leer la línea por token e id, validar estado, plazo y maquilladora activa, y revalidar con `consultarDisponibilidad` (como `crear.ts`). Dentro: (a) `SELECT ... FROM reserva WHERE id = ? AND estado = 'confirmada' FOR UPDATE` serializa contra una cancelación o cualquier transición de estado (hacen `UPDATE` sobre esa fila y luego desactivan líneas: mismo orden de bloqueos); si no devuelve fila, rechazar. (b) `actualizarLineaLiberandoVencidas`.
8. **`actualizarLineaLiberandoVencidas`**, análoga a `insertarLineaLiberandoVencidas`: `UPDATE reserva_linea SET maquilladora, inicio, fin WHERE id = ? AND activa AND inicio = <inicio visto> AND maquilladora_id = <maquilladora vista>` en un savepoint; ante choque llama a `liberarVencidasEnConflicto` con un nuevo parámetro opcional `excluirLineaId` (la línea propia no es bloqueante) y reintenta hasta `MAX_REINTENTOS_DE_LIBERACION`. Devuelve `"actualizada" | "ocupado" | "turno_cambiado"`. Si el `UPDATE` afecta 0 filas se lee la línea: si ya está en el destino pedido es un doble clic y se responde éxito repetido; si no, `turno_cambiado`. `ocupado` deshace la transacción completa (también las vencidas ya canceladas).
9. **Resultados de la operación:** `reprogramada` (con `repetida`), `horario_no_disponible`, `fuera_de_plazo`, `no_reprogramable`, `turno_cambiado`, `no_encontrada`, `maquilladora_no_disponible`. La pantalla mapea cada uno a un mensaje; en `horario_no_disponible` conserva maquilladora y día y vuelve a mostrar la disponibilidad.
10. **Server Actions sin `requerirAdmin()`**: las clientas no tienen cuenta; token y validación Zod del servidor (ADR 0006). La acción vive en un archivo nuevo `reprogramar/actions.ts`, no en el `actions.ts` compartido.

## Risks / Trade-offs

- [Varios agentes tocan `page.tsx`] → el cambio es una sección añadida; se declara en el informe para coordinar.
- [#12 también necesita la regla de 24 h] → debe haber una sola constante; quien llegue segundo reutiliza el módulo del primero (ver Open Questions).
- [Sin historial: se pierde el horario anterior] → aceptado; si el studio lo quiere, requiere una tabla y una migración.
- [`ignorarLineaId` y `excluirLineaId` modifican funciones compartidas] → parámetros opcionales; las pruebas existentes deben seguir en verde.
- [Bloqueo de fila de la reserva] → transacción corta; un bloqueo mutuo (`40P01`) se traduce a "horario no disponible".

## Open Questions

- **Plazo del nuevo horario:** se asume que no se exige que el destino esté a 24 h o más (solo que sea futuro y esté ofrecido). Confirmar con el studio.
- **Grupo:** se asume reprogramación por integrante; confirmar si el studio prefiere mover la reserva completa.
- **Estados:** se asume solo `confirmada` (el PRD habla del "pago ya validado"). Reprogramar en `pendiente_validacion` queda fuera hasta decidirlo.
- **Cuántas veces:** se asume sin tope. Un tope exigiría una columna (migración).
- **Si la reprogramación se rechaza:** no hay aprobación del studio; "rechazo" es solo horario ocupado o plazo, y la clienta ve el motivo con su turno original intacto.
- **Precio y servicio:** el precio no cambia (copia de la línea) y no se permite cambiar de servicio.
- **Módulo del plazo compartido con #12:** definir cuál de los dos ítems crea la constante de 24 h.
- El PRD no tiene un `REVISAR` que afecte directamente a este ítem.
