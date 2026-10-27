# Design

## Context

Estado de partida (#1 a #9): la página `/reservas/<token>` (`obtenerReservaPorToken`, `EstadoDeReservaVista`) muestra el estado y los turnos, y dice que "falta completar el pago" sin ofrecer cómo. La base ya tiene `reserva.numero_operacion` con `UNIQUE` (`reserva_numero_operacion_unico`) y el `CHECK` `reserva_estado_numero_coherente` (`pendiente_pago` ⇒ sin número; `pendiente_validacion`/`confirmada` ⇒ con número; `cancelada` puede conservarlo). El vencimiento lazy (#8) define `condicionVencida` y `PLAZO_VENCIMIENTO_MINUTOS` en `src/lib/reserva/vencimiento.ts` y cancela las vencidas con un `UPDATE` condicionado; su diseño anotó que el ingreso del número debe ser un `UPDATE` condicionado a `estado = 'pendiente_pago'`. No hay ninguna Server Action sobre una reserva existente ni configuración del QR. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0003: una vencida no cancelada todavía acepta el número; una cancelada por vencimiento lo rechaza explicando que venció. Una devuelta por rechazo no vence. ADR 0004: el enlace con token es la única credencial y no hay mensajería saliente. ADR 0005: número único. ADR 0006: Server Action con Zod. ADR 0009: transacción o sentencia única, validación con mensajes comprensibles, sin errores técnicos.
- PRD: sin subida de archivos ni pasarela; el número se escribe como texto; el studio lo cruza con su billetera (#11).
- Next 16 con `cacheComponents`: la página ya lee `params` y la base dentro de `<Suspense>`; el reloj (`new Date()`) solo se usa tras leer los parámetros.
- Un cliente de transacción de `pg` no admite consultas en paralelo (no se usa transacción aquí: es una sola sentencia).

## Goals / Non-Goals

**Goals:**
- Que ninguna reserva quede con número sin pasar a `pendiente_validacion`, ni al revés, aun con dos pagos o con un vencimiento simultáneos.
- Que cada rechazo diga a la clienta qué pasó y qué hacer, sin mostrar errores técnicos.
- Que la lógica del ingreso se pruebe contra Postgres real sin montar Next.

**Non-Goals:**
- Validar o rechazar el pago, el motivo de rechazo y el nuevo ingreso tras un rechazo (#11; el ingreso ya funciona para una reserva devuelta a `pendiente_pago`, sin mostrar el motivo).
- Cancelación, reembolso y reprogramación (#12 y #13).
- Generar el QR o integrar una pasarela.
- Mostrar el número de operación guardado.

## Decisions

### 1. El pago vive en la página de estado, no en una ruta aparte
La sección de pago aparece dentro de `/reservas/<token>` cuando la reserva está en `pendiente_pago`. Una sola URL cubre todo el ciclo (ADR 0004): la clienta que cierra la pestaña vuelve al mismo enlace y encuentra el QR otra vez. `EstadoDeReservaVista` recibe el token y la configuración del pago y delega en `SeccionDePago`.
- *Alternativa:* una ruta `/reservas/<token>/pagar`. Duplica la lectura y la validación del token, y deja dos enlaces para una misma reserva.

### 2. Configuración del QR por variables de entorno
`src/lib/pago/configuracion.ts` exporta `leerConfiguracionDePago(env)`: lee `QR_PAGO_URL` (una URL `https://` o una ruta que empieza con `/`, por ejemplo `/qr-pago.png` si el studio guarda la imagen en `public/`) y `BILLETERA_NOMBRE` (opcional; por defecto "la billetera del studio"). Devuelve `null` si no hay QR válido. La página lo lee en el servidor (no necesita `NEXT_PUBLIC_`), así que no se expone nada que no se muestre. El QR se dibuja con un `<img>` común: una imagen de QR no debe pasar por el optimizador de Next (podría degradar los módulos) y evita configurar dominios remotos.
- Sin QR válido la sección dice que el pago por QR todavía no está disponible y **no ofrece el campo del número**: nadie debe pagar sin saber a dónde ni informar un pago que no hizo.
- *Alternativa:* un QR de ejemplo incluido en el repositorio. Descartada: una clienta podría pagar a una cuenta que no es del studio.
- *Alternativa:* guardar la URL del QR en la base y editarla desde el panel. Más flexible, pero agrega una tabla y una pantalla de panel fuera del alcance; si el studio lo pide, es un ítem aparte.

### 2. El número se normaliza antes de guardarlo
`src/lib/pago/esquemas.ts` define `numeroOperacionSchema`: texto recortado, obligatorio (`"Ingresá el número de operación."`), de 4 a 30 caracteres, solo letras, números y guiones, sin espacios interiores, y convertido a mayúsculas. Normalizar a mayúsculas hace que `UNIQUE` compare lo mismo que ve el studio y que "op-1" y "OP-1" no sean dos números distintos. El formato es un supuesto (no está en el PRD): cubre los códigos numéricos y alfanuméricos habituales de las billeteras y se ajusta en una línea si el studio usa otro. `ingresoSchema` suma el `token` (`z.uuid()`).
- *Alternativa:* aceptar cualquier texto. Dejaría pasar basura y duplicados por mayúsculas.
- *Alternativa:* solo dígitos. Excluiría billeteras que usan códigos alfanuméricos.

### 3. Ingreso con un único `UPDATE` condicionado
`ingresarNumeroDeOperacion(db, { token, numero })` (`src/lib/pago/ingreso.ts`, base inyectada, sin Next):
1. `UPDATE reserva SET numero_operacion = $n, estado = 'pendiente_validacion', motivo_rechazo = NULL WHERE token = $t AND estado = 'pendiente_pago' AND numero_operacion IS NULL RETURNING id` (el motivo de un rechazo anterior se limpia al informar un número nuevo, como pide el ADR 0005). Si devuelve una fila: `registrado`. No hace falta transacción: es una sentencia y el `CHECK` mantiene estado y número coherentes.
2. Si lanza `23505` sobre `reserva_numero_operacion_unico`: `numero_usado`, sin haber cambiado nada (la sentencia falló completa).
3. Si no afecta filas, se lee la reserva por token para explicar el motivo: no existe → `no_encontrada`; ya tiene el mismo número (en `pendiente_validacion` o `confirmada`) → `registrado` (idempotente: el doble clic no es un error); en `pendiente_validacion` con otro número → `pago_ya_informado`; `confirmada` con otro número → `ya_confirmada`; `cancelada` con motivo `vencida` → `vencida`; cancelada por otro motivo → `cancelada`. Si la lectura la encuentra todavía en `pendiente_pago` sin número (otra transacción se deshizo en el medio), se reintenta el `UPDATE` una vez.
- **La carrera contra el vencimiento (#8) se resuelve sola:** la cancelación lazy es otro `UPDATE` condicionado sobre la misma fila. Si ambas coinciden, la segunda espera el bloqueo de fila de la primera y, ya confirmada, Postgres reevalúa su condición (`estado = 'pendiente_pago' AND numero_operacion IS NULL` falla si ganó el número; la condición de vencida falla si ganó la cancelación porque el estado cambió). Gana exactamente una. No se necesita ninguna lógica de "reloj" en el ingreso: una reserva con el plazo pasado que nadie canceló sigue aceptando el número (ADR 0003).
- **Unicidad simultánea:** dos reservas que envían el mismo número a la vez: la segunda espera en el índice único y recibe `23505` cuando la primera confirma.
- *Alternativa:* leer y luego escribir en dos pasos. Abre una ventana en la que el vencimiento o un segundo envío cambian la reserva entre la lectura y la escritura.
- *Alternativa:* una transacción con `SELECT … FOR UPDATE`. Equivalente en efecto, pero más ruido y una conexión retenida sin necesidad.

### 4. Server Action pública única
`src/app/reservas/[token]/actions.ts` exporta `ingresarNumero(estado, formData)`: delega en `procesarIngreso(formData, deps)` (`src/lib/pago/formulario.ts`, con la dependencia inyectada para probarla sin base), que valida con Zod y devuelve un resultado para el formulario: `registrado`, `invalido` (error del campo y valor escrito), o `rechazado` con el motivo (`numero_usado` se muestra junto al campo; `vencida`, `cancelada`, `pago_ya_informado`, `ya_confirmada` y `no_encontrada` como un aviso con su texto). Tras `registrado` llama a `refresh()` de `next/cache` para que la página muestre la reserva en `pendiente_validacion` sin recargar. No usa `requerirAdmin()`: las clientas no tienen cuenta; su protección es el token y la validación. El token viaja en un campo oculto.

### 5. Lectura: plazo y motivo de cancelación
`obtenerReservaPorToken` suma al modelo `plazoPagoHasta: Date | null` (creación + `PLAZO_VENCIMIENTO_MINUTOS` solo si está en `pendiente_pago` y sin motivo de rechazo, es decir, si puede vencer; `null` en cualquier otro caso) y `motivoCancelacion` (`vencida` | `clienta` | `studio` | `null`). Se selecciona `motivo_rechazo` solo para calcular el plazo y **no se devuelve**, igual que el teléfono y el número de operación: la prueba de privacidad pasa a esperar exactamente las claves nuevas. El plazo usa la constante de #8 para que haya una sola definición.

### 6. Pantalla
- `SeccionDePago` (`src/components/publico/`): título "Pagá tu reserva", monto exacto, QR con `alt` que nombra la billetera, instrucciones breves (escaneá el QR, pagá el monto exacto, copiá el número de operación y escribilo aquí) y el plazo: "Tenés 20 minutos desde que reservaste: hasta las HH:MM (hora de Lima)". Con el plazo pasado y la reserva sin cancelar, un aviso: el horario podría haberse liberado; si nadie lo tomó todavía podés ingresar tu número. Sin plazo (reserva devuelta por un rechazo) no muestra nada de plazo. La hora se calcula en el servidor con `new Date()` leído tras `params` (sin cuenta regresiva ni JavaScript de reloj).
- `FormularioNumero` (cliente, `useActionState`): campo de texto "Número de operación" con `autoComplete="off"` y `inputMode="text"`, botón "Ya pagué: enviar mi número" deshabilitado mientras envía, el error junto al campo y los avisos de rechazo. Con `vencida` ofrece "Elegir otro horario" (enlace al catálogo).
- `EstadoDeReservaVista`: para `cancelada` con motivo `vencida` explica que pasaron 20 minutos sin pago y otra clienta tomó el horario, con el enlace al catálogo; el resto de las cancelaciones conservan el texto actual.

### 7. Pruebas
- Unitarias: configuración del QR (válido, ruta de `public/`, URL no `https`, vacío, nombre por defecto), esquema del número (vacío, espacios, 3 y 4 y 30 y 31 caracteres, minúsculas, símbolos, espacios interiores, guiones), `procesarIngreso` con dependencias simuladas (cada resultado, token inválido, archivo en el campo), acción con `refresh` y sin sesión, y componentes (sección de pago con y sin QR, plazo dentro y fuera, sin plazo tras rechazo, formulario con errores, doble envío, vencida con enlace, estado cancelada por vencimiento).
- Integración con Postgres real (ADR 0011): ingreso válido y normalización; vacío y formato inválido no tocan nada; número ya usado (también con otras mayúsculas) deja la reserva intacta; reserva con plazo pasado sin cancelar acepta; cancelada por vencimiento, por otro motivo, confirmada y con otro número ya informado; reenvío del mismo número; reserva devuelta por un rechazo; grupo con varias líneas; token inexistente; **carrera con el vencimiento usando `crearReservaIndividual` real y `ingresarNumeroDeOperacion` real** (gana uno, estado coherente, repetida con las dos conexiones del ítem anterior); **dos reservas con el mismo número simultáneas**.
- Rutas: `curl` sobre `npm run start`: `/reservas/<token>` sigue protegido y un token desconocido se ve como no encontrado; la sección de pago en vivo se verifica a mano porque exige datos en la base.

## Risks / Trade-offs

- **El QR no existe todavía** → sin `QR_PAGO_URL` válido la página no ofrece el campo; hasta que el studio entregue su QR el flujo se detiene en `pendiente_pago`. Es deliberado frente a mostrar un QR falso.
- **El formato del número es un supuesto** → si las billeteras del studio usan otro, la clienta recibe un error de formato y puede escribirle al studio. Cambiarlo es una línea y una prueba; conviene mirar un número real antes de desplegar.
- **Pagar tarde y perder el horario** (riesgo aceptado del ADR 0003) → si la reserva ya fue cancelada la clienta lo ve explicado y debe pedir el reembolso al studio; el sistema no gestiona reembolsos de ese caso.
- **El mensaje de "número ya usado" revela que ese número existe en otra reserva** → lo exige el PRD (unicidad); no muestra a quién pertenece.
- **Quien tenga el enlace puede informar un número** (ADR 0004) → un número equivocado o malicioso deja la reserva en `pendiente_validacion` hasta que el studio la rechace (#11); no hay un número que "queme" a otras reservas porque el rechazo lo libera.
- **`refresh()` tras el ingreso** → si falla la red la clienta ve el formulario sin cambios aunque el número se guardó; al recargar ve `pendiente_validacion`. El reenvío es idempotente.

## Migration Plan

Sin migraciones. Variables nuevas: `QR_PAGO_URL` y `BILLETERA_NOMBRE` (no son secretos; se definen en `.env.local` y en Vercel). Sin ellas el sistema funciona pero no ofrece el pago. Rollback: revertir el despliegue; los números ya ingresados son datos válidos para el código anterior.

## Open Questions

- ¿Cuál es el QR y el nombre de la billetera del studio? Hace falta la imagen (o una URL) antes de abrir el pago.
- ¿Cómo se ven los números de operación de esa billetera? Se asumió de 4 a 30 caracteres alfanuméricos y guiones.
- ¿Debe mostrarse a la clienta el número que informó, para que lo corrija antes de la validación? Hoy no se muestra (corregirlo exige el rechazo del studio, #11).
- ¿Hay que indicar el monto por integrante en un grupo? Hoy se muestra solo el total.
