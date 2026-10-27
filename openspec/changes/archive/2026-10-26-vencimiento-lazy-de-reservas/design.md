## Context

Estado de partida (ítems #1 a #7): `crearReservaIndividual(db, solicitud, ahora)` revalida con `consultarDisponibilidad` fuera de la transacción y luego abre `db.transaction` solo con los dos inserts (reserva y línea); traduce `23P01` y `40P01` a `horario_no_disponible` y `23505` sobre `reserva_clave_idempotencia_unica` a la reserva existente. `consultarDisponibilidad` trata como ocupada toda línea activa (incluida la de una `pendiente_pago`) y su comentario anota que el #8 excluirá las vencidas. La base ya tiene la exclusión `reserva_linea_sin_solapamiento` (solo líneas activas), `reserva.creada_en`, `motivo_rechazo`, `motivo_cancelacion` con valor `vencida` y los CHECK `reserva_cancelacion_coherente` (cancelada exige motivo y viceversa) y `reserva_estado_numero_coherente`. No hace falta migración.

Restricciones: ADR 0003 (regla de vencimiento, cancelar y reintentar en la misma transacción, `UPDATE` condicionado), ADR 0005 (`activa` debe sincronizarse en la misma transacción), ADR 0006 (sin endpoints; esto es lógica de servidor invocada por Server Actions), ADR 0009 (transacciones, `23P01`/`40P01` = "horario no disponible"). Un cliente de transacción de `pg` no admite consultas en paralelo (deprecado, se elimina en pg 9): dentro de la transacción todo va en serie. Tests con node-postgres y Postgres real (ADR 0011).

## Goals / Non-Goals

**Goals:**
- Que una reserva vencida nunca ocupe horario, ni en la oferta pública ni al reservar.
- Que la cancelación por vencimiento sea atómica con la creación de la reserva nueva y segura frente a un número de operación que llega justo entonces.
- Que la pieza sea reutilizable por la reserva grupal (#9) sin reescribirla.

**Non-Goals:**
- Pantalla de pago, ingreso del número, rechazo con mensaje de "venció" (#10); panel y cancelación manual (#11).
- Cron o limpieza masiva: la liberación solo ocurre al chocar (ADR 0003).
- Tope de reservas sin pagar por teléfono (decisión aceptada).
- Cambiar cómo muestran el estado la página de estado o el panel a una reserva vencida aún no cancelada.

## Decisions

### 1. Una sola definición de "vencida", en SQL y con `ahora` inyectado
`src/lib/reserva/vencimiento.ts` exporta `PLAZO_VENCIMIENTO_MINUTOS = 20` y `condicionVencida(ahora)`, un fragmento SQL de Drizzle: `reserva.estado = 'pendiente_pago' and reserva.numero_operacion is null and reserva.motivo_rechazo is null and reserva.creada_en < ahora - 20 min` (estricto: exactamente 20 minutos no vence). Lo usan la consulta de disponibilidad y el `UPDATE` de cancelación, para que oferta y cancelación nunca discrepen. El umbral se calcula con el `ahora` que ya recibe `crearReservaIndividual` y `consultarDisponibilidad` (no con `now()` de la base), lo que hace las pruebas deterministas.
- *Alternativa:* `now()` de Postgres, sin sesgo de reloj entre Vercel y Neon. Descartada: obliga a manipular `creada_en` con sentencias SQL en cada prueba; el sesgo posible (segundos) es despreciable frente a 20 minutos.
- La constante vive en el módulo (configurable en código); no se agrega variable de entorno.

### 2. Disponibilidad: excluir vencidas en la consulta de líneas
En `consulta.ts` la consulta de líneas activas hace `JOIN reserva` y agrega `not (condicionVencida(ahora))`. Sigue seleccionando solo `inicio` y `fin` y no toca `calcularHuecos`. Una vencida deja de aparecer ocupada; una `pendiente_pago` devuelta por rechazo, en validación o confirmada sigue ocupando.

### 3. Liberar y reintentar con un savepoint dentro de la transacción
Un error de Postgres aborta la transacción entera, así que reintentar el insert dentro de la misma transacción exige un savepoint. Drizzle lo ofrece como transacción anidada (`tx.transaction(...)`): si el callback lanza, hace `ROLLBACK TO SAVEPOINT`, relanza y la transacción externa sigue utilizable (con node-postgres y con neon-serverless).

`vencimiento.ts` expone, para uso por línea:
- `insertarLineaLiberandoVencidas(tx, valoresLinea, ahora): Promise<"insertada" | "ocupado">`:
  1. `tx.transaction(sp => sp.insert(reservaLinea).values(...))`; si no hay error, `"insertada"`.
  2. Si el error es `23P01` o `40P01` (usa `leerErrorPg` y `esChoqueDeHorario`), llama a `liberarVencidasEnConflicto`. Cualquier otro error se relanza.
  3. Si liberó al menos una y no quedó ninguna línea vigente en conflicto, repite el paso 1, un número acotado de veces (3); si no, `"ocupado"`.
- `liberarVencidasEnConflicto(tx, { maquilladoraId, inicio, fin }, ahora): Promise<{ canceladas: number[]; bloqueantes: number }>`: en serie, (a) selecciona las líneas activas de esa maquilladora que se solapan con `[inicio, fin)` junto con su reserva y si está vencida (`condicionVencida`); (b) por cada reserva vencida distinta ejecuta `UPDATE reserva SET estado='cancelada', motivo_cancelacion='vencida' WHERE id = $1 AND <condicionVencida(ahora)> RETURNING id`; (c) solo para los ids devueltos, `UPDATE reserva_linea SET activa=false WHERE reserva_id IN (...)`; (d) `bloqueantes` cuenta las líneas en conflicto de reservas no vencidas más las vencidas cuyo `UPDATE` no afectó filas.
- Si `bloqueantes > 0` no hay reintento y el resultado es `"ocupado"` → `horario_no_disponible`. Esto cubre "vencida y vigente a la vez": las cancelaciones hechas se deshacen porque `crearReservaIndividual` devuelve `horario_no_disponible` y relanza dentro de la transacción un marcador de reversión (ver decisión 4), de modo que no queda ninguna reserva cancelada sin que la nueva exista.

El `UPDATE` condicionado es el que resuelve la carrera: si otra transacción está cambiando esa reserva (ingreso del número, #10), el `UPDATE` espera su bloqueo de fila; en READ COMMITTED, al confirmarse la otra, Postgres reevalúa la condición, ya falsa (tiene número), y devuelve 0 filas. Con 0 filas no hay reintento (ADR 0003). Aceptamos un efecto conservador: si en cambio otra transacción de reserva nueva acaba de cancelar esa misma vencida, esta segunda recibe `horario_no_disponible` aunque quizá su turno pudiera haber entrado; la clienta lo reintenta y es raro.
- *Alternativa:* cancelar antes de insertar (proactivo, sin esperar el choque). Haría un `UPDATE` en cada reserva exitosa; el ADR pide cancelar solo al chocar.
- *Alternativa:* `SELECT ... FOR UPDATE` sobre las reservas candidatas. Innecesario: el `UPDATE` condicionado ya serializa y mantiene la regla en una sola sentencia.
- *Alternativa:* dejar que el choque reviente la transacción y abrir otra para cancelar. Pierde la atomicidad pedida por el ADR 0003 (la reserva vencida podría cancelarse sin que la nueva se cree).

### 4. Integración en `crearReservaIndividual`
La transacción pasa a: insertar la `reserva`; llamar a `insertarLineaLiberandoVencidas`; si devuelve `"ocupado"`, `crearReservaIndividual` lanza `HorarioOcupado` (clase exportada por `vencimiento.ts`, para que la reserva grupal la reutilice) que deshace la transacción completa, incluidas las cancelaciones hechas, y fuera de la transacción la traduce a `horario_no_disponible`. Los errores `23P01`/`40P01` que escapen (por ejemplo, un choque que reaparece tras la liberación) siguen yendo a la traducción existente, y la búsqueda por clave de idempotencia y el `23505` no cambian. La revalidación con `consultarDisponibilidad` queda fuera de la transacción, ahora ofreciendo también los horarios de reservas vencidas.
- La `reserva` se inserta con `creada_en = ahora` (el reloj inyectado) y no con el `now()` de la base, para que el vencimiento use un solo reloj de punta a punta. En producción `ahora` es `new Date()`, así que no cambia nada observable; en pruebas permite fijar el instante.

### 5. Reutilización por la reserva grupal (#9)
La reserva grupal inserta N líneas en la misma transacción, todo o nada. Con esta pieza, #9 llama a `insertarLineaLiberandoVencidas(tx, linea_i, ahora)` por cada línea, en serie; si alguna devuelve `"ocupado"` lanza el mismo `HorarioOcupado` y se deshace todo (incluidas cancelaciones de vencidas hechas para líneas anteriores). Las cancelaciones se acumulan en la misma transacción. El código de #8 no asume una sola línea. Para que #8 y #9 no se pisen: #8 solo cambia en `crear.ts` el cuerpo de la transacción y el manejo del error de choque, y no toca `esquemas.ts` ni `confirmacion.ts`; si #9 se integra primero, el cuerpo del bucle de líneas es el que se reemplaza por la llamada a `insertarLineaLiberandoVencidas`.

### 6. Pruebas
- Unitarias: `condicionVencida` no se prueba aislada (es SQL); sí la constante y el mapeo de resultados de `insertarLineaLiberandoVencidas` con una transacción simulada (error ajeno se relanza, `"ocupado"` sin vencidas, tope de reintentos).
- Integración con Postgres real: la regla (19, 20 y 21 minutos; con motivo de rechazo; en `pendiente_validacion` y `confirmada`); disponibilidad (vencida libre, vigente ocupada, rechazada ocupada); creación sobre vencida (cancelada con motivo `vencida`, líneas inactivas, CHECKs satisfechos, nueva creada); vencida con varias líneas; dos vencidas en conflicto; vencida más vigente (nada se cancela); todo o nada (falla forzada tras cancelar); dos reservas simultáneas por una vencida (una gana, la vencida se cancela una vez; repetida varias veces por el `40P01`); idempotencia intacta; varias reservas sin pagar de un mismo teléfono.
- Carrera contra el número de operación (#10 aún no existe): una conexión abre una transacción que ejecuta el `UPDATE` que haría el ingreso (`numero_operacion` y `estado = 'pendiente_validacion'`) sin confirmar; en paralelo `crearReservaIndividual` queda esperando; se confirma la primera transacción y se comprueba que la reserva original se conserva y la nueva recibe `horario_no_disponible`. El caso inverso: la cancelación se confirma primero y un `UPDATE` posterior del número, condicionado a `estado = 'pendiente_pago'` como debe ser el del #10, no afecta filas (se verifica que la reserva sigue cancelada).
- Se actualizan las pruebas existentes de `consulta.int.test.ts` (la que dice que la `pendiente_pago` ocupa pasa a usar una reserva reciente).

## Risks / Trade-offs

- **Una vencida sigue como `pendiente_pago` en la página de estado y el panel hasta que otra clienta tome el horario** → es el comportamiento del ADR 0003; el #10 debe leer el estado y la regla (reutilizando `condicionVencida`) para mostrar "venció" cuando corresponda.
- **Clienta que paga tarde pierde el horario y queda reembolso manual** → riesgo aceptado del ADR 0003; se mitiga con el plazo visible en la pantalla de pago (#10).
- **Sesgo de reloj app/base** → despreciable frente a 20 minutos; se registra como supuesto.
- **Savepoint dentro de la transacción de Neon (`neon-serverless` con `Pool`)** → se comprueba en integración con node-postgres; el driver de producción usa el mismo protocolo, pero la prueba contra Neon queda como verificación manual al desplegar.
- **Segunda clienta perjudicada en una carrera entre dos cancelaciones de la misma vencida** → resultado conservador ("horario no disponible"), aceptado.
- **Quien llega a choque paga un `JOIN` y hasta tres reintentos** → solo ocurre en el camino de conflicto.

## Migration Plan

Sin migraciones ni cambios de esquema. Despliegue normal; revertir el despliegue basta (las reservas ya canceladas por `vencida` son datos válidos para el código anterior).

## Open Questions

- ¿Debe la página de estado mostrar ya "venció" para una reserva vencida aún no cancelada, o se deja al #10? Este change no la modifica.
- ¿Conviene que el panel (#11) marque visualmente las vencidas aún figurando `pendiente_pago`?
- ¿El plazo de 20 minutos debe poder cambiarse por variable de entorno? Hoy es una constante en código (el ADR 0003 dice "constante configurable").
