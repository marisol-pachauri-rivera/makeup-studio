# Design

## Context

Estado de partida (#1 a #10): `reserva` ya tiene `estado`, `numero_operacion` (único), `motivo_rechazo`, `motivo_cancelacion` (`vencida|clienta|studio`), `estado_reembolso` y `validada_en`; los `CHECK` exigen `pendiente_pago` sin número, `pendiente_validacion` y `confirmada` con número, y `cancelada` con motivo (y solo ella). `activa` de las líneas se sincroniza a mano en la misma transacción (ADR 0005). El panel ya tiene sesión (`requerirAdmin()` en cada acción, `requerirAdminOLogin()` en cada página dentro de `<Suspense>`) y secciones con el patrón: capa de datos con la base inyectada en `src/lib/<modulo>/`, funciones de formulario puras `procesar*`, acciones delgadas y `useActionState`. El ingreso del número (#10) ya hace `UPDATE ... WHERE estado = 'pendiente_pago' AND numero IS NULL` y limpia `motivo_rechazo`. La página de estado (`obtenerReservaPorToken`) selecciona `motivo_rechazo` solo para calcular el plazo y no lo devuelve (se dejó para este ítem). No existe ninguna pantalla de reservas en el panel. Ver `proposal.md` para el motivo.

Restricciones: ADR 0003 (el rechazo no vence), ADR 0004 (sin plazo de validación, sin mensajería), ADR 0005 (rechazo en una sola operación), ADR 0006 (Server Actions con Zod y sesión), ADR 0007 (sesión admin), ADR 0011 (pruebas con Postgres real). Next 16 con `cacheComponents`: lo que lee `params`, `searchParams`, la sesión o la base va detrás de `<Suspense>` y el reloj solo se lee después. Un cliente de transacción de `pg` no admite consultas en paralelo.

## Goals / Non-Goals

**Goals:**
- Que la administradora pueda cotejar y resolver cada pago en pocos pasos, sin salir del panel.
- Que ninguna carrera (otra administradora, la clienta que corrige su número, el vencimiento lazy) deje una reserva en un estado incoherente.
- Que la clienta vea por qué se rechazó su pago, junto al campo donde lo corrige.

**Non-Goals:**
- Marcar el reembolso como `realizado` y la cancelación por la clienta (#12), reprogramación (#13), agenda por maquilladora (#14).
- Aviso proactivo a la clienta (ADR 0004), plazo máximo de validación, búsqueda por texto, exportación.
- Migraciones: no hacen falta.

## Decisions

### 1. Módulo propio `src/lib/reservas-panel/`
Capa de datos con la base inyectada, sin importar Next: `consultas.ts` (`listarReservas`, `obtenerReservaParaPanel`), `transiciones.ts` (`validarReserva`, `rechazarReserva`, `cancelarReserva`), `esquemas.ts` (entradas Zod) y `formularios.ts` (`procesarValidacion`, `procesarRechazo`, `procesarCancelacion`, puras y probables sin Next). Las acciones delgadas viven en `src/app/admin/(panel)/reservas/actions.ts`. Se evita tocar `src/lib/reserva/` (lo comparten #12 y #13) salvo la lectura de estado de la decisión 7.

### 2. Cada transición es un `UPDATE` condicionado al estado esperado
- Validar: `SET estado='confirmada', validada_en=now() WHERE id=? AND estado='pendiente_validacion'`.
- Rechazar: `SET estado='pendiente_pago', numero_operacion=NULL, motivo_rechazo=? WHERE id=? AND estado='pendiente_validacion'`. Es una sola sentencia, así que el `CHECK` nunca ve un estado a medias y no hace falta transacción. Las líneas no se tocan (siguen activas).
- Cancelar: transacción de dos sentencias en serie: `UPDATE reserva SET estado='cancelada', motivo_cancelacion='studio', estado_reembolso = CASE WHEN estado='confirmada' THEN 'pendiente' ELSE estado_reembolso END WHERE id=? AND estado <> 'cancelada'` y, si afectó una fila, `UPDATE reserva_linea SET activa=false WHERE reserva_id=?`.
- Si el `UPDATE` no afecta filas, una lectura de explicación devuelve el resultado: `no_encontrada`, o `estado_distinto` con el estado actual (y `ya_aplicada` cuando el estado actual ya es el destino, para que el doble clic no sea un error). Es el mismo patrón que `ingresarNumeroDeOperacion`.
- Carreras: contra el ingreso de #10 (que exige `pendiente_pago`), contra el vencimiento (que exige `condicionVencida`) y entre dos administradoras, el segundo `UPDATE` espera el bloqueo de fila del primero y Postgres reevalúa su condición: gana exactamente uno. Validar/rechazar nunca compiten con el ingreso (estados disjuntos); cancelar sí, y se prueba.
- *Alternativa:* leer el estado y luego escribir. Descartada: abre la ventana de carrera que los `UPDATE` condicionados cierran.

### 3. Reembolso al cancelar desde el panel
Al cancelar una `confirmada`, el reembolso queda `pendiente` en la misma sentencia (el pago ya validado se devuelve). Es un supuesto: el `TECH-DESIGN.md` solo lo dice para la cancelación de la clienta (ver preguntas abiertas). La lista muestra la columna de reembolso para que #12 marque `realizado` sin cambiar esta pantalla.

### 4. Lista: orden, paginación y filtro
Una consulta con `ORDER BY (estado <> 'pendiente_validacion'), CASE WHEN estado = 'pendiente_validacion' THEN creada_en END ASC, creada_en DESC, id DESC`, `LIMIT 25 OFFSET (pagina-1)*25` y un `count(*)` para saber si hay más (fuera de transacción, dos consultas en serie). Parámetros leídos de `searchParams` con Zod (`pagina` entero positivo, `estado` de los cuatro): valores inválidos caen a los valores por defecto sin error. El primer turno es `min(inicio)` y la cantidad de personas es `count` de líneas, con `group by reserva.id`. Las marcas "esperando nuevo número" y "plazo vencido" se calculan con `motivo_rechazo` y `condicionVencida(ahora)` (reutilizada, sin copiar su lógica); solo se leen, nunca cancelan. `ahora` se toma tras leer `searchParams`.
- *Alternativa:* paginación por cursor. Más robusta ante inserciones, pero el volumen de un studio no la justifica.

### 5. Contacto
La administradora ve nombre y teléfono en la lista y en el detalle; el teléfono es un enlace `tel:` (la clienta no tiene WhatsApp automatizado, ADR 0004, y el studio ya la contacta por su cuenta). No se genera ningún enlace de WhatsApp: sería mensajería fuera de alcance. La página pública sigue sin mostrar el teléfono.

### 6. Interfaz de acciones
Detalle `/admin/reservas/<id>` (el id numérico de `reserva`, validado con Zod). Validar es un botón de un clic; rechazar es un formulario con un campo de motivo (`CampoTexto` multilínea, `useActionState`, error junto al campo, conserva lo escrito); cancelar es un botón que despliega un aviso con "Confirmar cancelación" y envía un campo `confirmar=true` que la acción exige (la confirmación se verifica también en el servidor, no solo en el cliente). Solo se ofrecen las acciones del estado actual: validar y rechazar en `pendiente_validacion`, cancelar en los tres no cancelados, nada en `cancelada`. Tras cada acción se llama `refresh()` y el resultado `estado_distinto` explica cuál es el estado ahora. Al navegar desde la lista, la acción se apoya en la lista ya cargada, pero siempre valida contra la base.

### 7. La página de estado muestra el motivo
`obtenerReservaPorToken` devuelve `motivoRechazo` solo cuando el estado es `pendiente_pago` (en cualquier otro estado devuelve `null`); sigue sin devolver teléfono, nombre, número ni clave. `EstadoDeReservaVista` y `SeccionDePago` lo muestran en un aviso con `role="status"` encima del formulario del número, con el texto "El studio no pudo validar tu pago: <motivo>. Ingresá el número de nuevo." El motivo es texto libre de la administradora: se renderiza como texto (React lo escapa), sin HTML. La prueba de privacidad de `estado.int.test.ts` se actualiza con la clave nueva. El ingreso de #10 ya limpia el motivo.

### 8. Menú del panel
Se agrega la sección "Reservas" a `SECCIONES_DEL_PANEL` en `src/components/panel/navegacion.tsx` (la cabecera de `layout.tsx` y los accesos de la página de inicio leen esa lista, por lo que `layout.tsx` no cambia). Es un archivo compartido con #14: el cambio es una entrada más en el arreglo y debe conciliarse al aplicar ambos.

## Risks / Trade-offs

- [El rechazo borra el número y se pierde el rastro de lo rechazado] → el motivo queda guardado y el studio puede anotarlo en el motivo; es el costo aceptado en el ADR 0005.
- [Una rechazada que la clienta no corrige ocupa el horario sin vencer] → la lista la marca "esperando nuevo número" y el studio la cancela; no hay cron (ADR 0003).
- [Sin plazo máximo de validación, la cola puede crecer] → el orden pone las pendientes más antiguas arriba; es el riesgo principal del PRD, decidido sin plazo en esta versión.
- [Una acción olvidada sin `requerirAdmin()` sería una brecha] → `tests/auth/acciones-del-panel.test.ts` ya recorre todos los `actions.ts` bajo `src/app/admin/`; cubre el archivo nuevo sin cambios.
- [Texto libre del motivo] → se acota a 300 caracteres, se recorta y se muestra escapado.

## Migration Plan

Sin migración de esquema ni de datos: todas las columnas y `CHECK` necesarios existen. Se despliega como cualquier cambio de la aplicación; para revertir, se retira el código (las reservas rechazadas o canceladas quedan en estados válidos del modelo actual).

## Assumptions and Open Questions

Supuestos tomados (a confirmar con el studio; ninguno contradice un ADR):
- Lista ordenada con pendientes de validación primero y más antiguas arriba; el resto de la más reciente a la más antigua; 25 por página y filtro por estado, sin búsqueda por texto.
- Cancelar una `confirmada` desde el panel deja el reembolso `pendiente`; cancelar una `pendiente_validacion` lo deja `no_aplica` (la clienta pudo haber pagado, pero el pago no está validado; ver pregunta 1).
- El teléfono se ve completo en el panel, como enlace `tel:`, y nunca en la página pública.
- Rechazar y validar no piden confirmación extra (rechazar ya exige escribir un motivo); cancelar sí la pide.
- La cancelación desde el panel no guarda motivo de texto (el esquema solo tiene `motivo_cancelacion = 'studio'`); no se crea columna nueva.
- Se puede cancelar una reserva cuyo turno ya pasó; no hay regla de 24 horas para el studio (solo para la clienta, #12).

Preguntas abiertas:
1. Si el studio cancela una reserva en `pendiente_validacion` y la clienta efectivamente pagó, ¿el reembolso debe quedar `pendiente`? Hoy el pago aún no está validado y se deja `no_aplica`.
2. ¿La cancelación del studio necesita un motivo de texto que la clienta vea? Hoy la página solo dice "cancelada". Requeriría una columna nueva o ampliar `motivo_cancelacion`, y quizá un ADR.
3. ¿Hace falta mostrar el historial de rechazos? Hoy se pierde (ADR 0005).
4. PRD con `<!-- REVISAR -->` relevantes: sin tiempo máximo de validación y suficiencia del número de operación como evidencia; se señalan, no se resuelven aquí.
