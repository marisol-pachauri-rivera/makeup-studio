# Design

## Context

Estado de partida (ítems #1 a #6): la base ya tiene `reserva` (token `uuid` generado por la base, `estado` con CHECK, `numero_operacion` único y coherente con el estado, `monto_total`) y `reserva_linea` (precio copiado, `activa`, exclusión `reserva_linea_sin_solapamiento` por maquilladora y rango semiabierto). El sitio público ya muestra el catálogo y la disponibilidad (`consultarDisponibilidad`, `calcularHuecos`, `src/lib/publico/catalogo.ts`) con los horarios solo informativos, y existen `ZONA_STUDIO` y sus conversiones, `idSchema`, `erroresPorCampo` y el patrón de `useActionState` del panel. No hay ninguna Server Action pública ni ninguna ruta con token. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0008: el estado del asistente vive en el cliente con respaldo en `sessionStorage`; nada se escribe hasta confirmar. ADR 0006: una Server Action valida con Zod. ADR 0009: transacción, traducción del choque, idempotencia por clave, errores sin detalles técnicos. ADR 0003: la reserva pendiente ocupa el horario (el vencimiento es del #8). ADR 0004: el enlace con token es la única credencial.
- Hallazgo del ítem #2: en una carrera real Postgres puede abortar al perdedor con `40P01` (bloqueo mutuo) además de `23P01` (exclusión); ambos son "horario ya no disponible".
- Driver `neon-serverless` con `Pool`: `db.transaction` abre una conexión y el reintento de conexión (#1) no aplica dentro de la transacción abierta.
- Next 16 con `cacheComponents`: lo que lee `params` o la base va detrás de `<Suspense>`; un `notFound()` dentro de `<Suspense>` ya respondió 200 (comportamiento observado en #6).

## Goals / Non-Goals

**Goals:**
- Que una reserva exista o no exista por completo, nunca a medias, y que nadie pueda duplicarla por doble clic ni quedarse con un horario que no se ofrecía.
- Que la lógica de creación se pruebe contra Postgres real sin montar Next, con la base inyectada como en #4 a #6.
- Que el enlace con token no se filtre por caché, buscadores ni `Referer`.

**Non-Goals:**
- Pago, vencimiento, grupos, cancelación, reprogramación y panel (#8 a #13).
- Persistir borradores en el servidor o bloquear el horario antes de confirmar (descartado en ADR 0003 y 0008).
- Recuperar un enlace perdido.

## Decisions

### 1. Clave de idempotencia: columna nueva en `reserva`
La clave es un `uuid` que el cliente genera al elegir el horario. Se guarda en `reserva.clave_idempotencia` (`uuid`, opcional, restricción `UNIQUE` llamada `reserva_clave_idempotencia_unica`), con una migración generada por `drizzle-kit` (agregar la columna y la restricción; no reconstruye ninguna tabla, así que no toca la exclusión de `reserva_linea`). Es opcional para que convivan las reservas sin clave (los fixtures de pruebas y futuras altas internas), igual que `numero_operacion`.
- *Alternativa:* una tabla aparte de claves, o guardar la clave solo en memoria del servidor. La tabla suma una entidad para un dato de una columna; la memoria no sirve en funciones serverless de Vercel.
- *Alternativa:* deducir duplicados por (teléfono, maquilladora, horario). Frágil y sin garantía: dos clientas con el mismo teléfono serían la misma.
- Esto concreta el ADR 0009 ("una clave generada por intento") sin contradecirlo; el ADR 0005 no la listaba entre los campos de `reserva`, así que se le agrega una nota (tarea 1.1).

### 2. Revalidación antes, dos inserts en una transacción
`crearReservaIndividual(db, solicitud, ahora)` (`src/lib/reserva/crear.ts`, base inyectada, sin Next ni sesión):
1. **Atajo de idempotencia:** si ya hay una reserva con esa clave, devuelve su token (`repetida: true`) sin revalidar nada. Por eso un reenvío legítimo funciona aunque su horario ya no se "ofrezca" (porque es suyo).
2. **Revalidación con la base (fuera de la transacción):** carga el servicio y la maquilladora **activos** (si falta alguno, `no_disponible`) y llama a `consultarDisponibilidad`, exigiendo que el instante pedido esté entre los inicios ofrecidos (si no, `horario_no_disponible`: cubre ocupado, pasado, fuera de horario, bloqueado y fuera de la grilla). Antes de responder el choque se vuelve a buscar la clave: otro envío con la misma clave pudo confirmar mientras tanto, y entonces el horario ya no se ofrece justamente porque es suyo.
3. **`db.transaction` solo con los dos inserts:** la `reserva` (`estado` por defecto `pendiente_pago`, `monto_total` = precio del servicio, nombre, teléfono, clave) y su `reserva_linea` (persona = nombre de la clienta, `fin` = inicio + duración, `precio` copiado); devuelve el `token` que generó la base. O quedan las dos filas o ninguna.
4. **Traducción de errores** fuera de la transacción (tras un error Postgres aborta la transacción entera): `23P01` y `40P01` → primero se vuelve a buscar la clave y, si no hay reserva con ella, `horario_no_disponible`; `23505` sobre `reserva_clave_idempotencia_unica` → se devuelve la reserva existente; cualquier otro error se relanza (llega a la página de error amigable de #1).
- La revalidación va fuera de la transacción por dos motivos: son lecturas en paralelo y un cliente de transacción de `pg` no admite consultas simultáneas (está deprecado y se elimina en pg 9), y no hace falta retener la transacción mientras se leen. Lo que impide quedarse con un horario ocupado no es esa lectura sino la exclusión de Postgres al insertar la línea.
- Dos envíos con la misma clave a la vez: el segundo espera en el índice único al insertar la reserva hasta que el primero confirma, y entonces recibe `23505` y devuelve la reserva del primero (nunca llega a chocar con su línea); si en cambio consulta la disponibilidad después de que el primero confirmó, el paso 2 lo resuelve igual.
- *Alternativa:* confiar solo en la exclusión y saltarse la revalidación. Dejaría reservar horarios inventados, pasados o bloqueados escribiendo la petición a mano.
- *Alternativa:* `SELECT … FOR UPDATE` de la maquilladora para serializar. Evitaría el `40P01` pero serializa todas las reservas de una maquilladora; basta con traducir los dos códigos.

### 3. Validación y contacto
`src/lib/reserva/esquemas.ts` define `solicitudReservaSchema` con: `clave` (`uuid`), `servicioId` y `maquilladoraId` (reutiliza `idSchema`), `inicio` (instante ISO, convertido a `Date`), `nombre` (recortado, 1 a 100) y `telefono` (recortado; solo dígitos, espacios, guiones, paréntesis y un `+` inicial; entre 7 y 15 dígitos). Los límites del nombre y del teléfono no vienen del PRD y viven en el esquema. Los errores salen por campo, en español, con `erroresPorCampo` de #4.

### 4. Server Action pública única
`src/app/reservar/actions.ts` exporta `confirmarReserva(estado, formData)`: valida, llama a `crearReservaIndividual(getDb(), …, new Date())` y devuelve un resultado discriminado: `ok` (con el token), `horario_no_disponible`, `no_disponible`, o `invalido` (errores por campo y valores escritos). No es una acción del panel, así que no usa `requerirAdmin()` (la prueba de convención solo recorre `src/app/admin/`); su protección es la validación del servidor y la revalidación de disponibilidad. Devuelve el token en vez de redirigir para que el cliente pueda limpiar su estado antes de navegar.

### 5. Estado del asistente: un módulo puro y almacenamiento inyectado
`src/lib/reserva/asistente.ts` exporta el esquema Zod del estado (`version: 1`, `clave`, `servicio` {id, nombre, precio, duración}, `maquilladora` {id, nombre}, `inicio` ISO, `contacto` {nombre, teléfono}) y funciones `leerAsistente`, `guardarAsistente`, `borrarAsistente` e `iniciarSeleccion`, que reciben el `Storage`. Leer nunca lanza: JSON inválido, otra versión o un `sessionStorage` bloqueado equivalen a "no hay reserva en curso". `iniciarSeleccion` genera una clave nueva y conserva el contacto ya escrito. El servidor **nunca confía** en los nombres ni precios guardados: reconstruye todo desde los identificadores; el resumen del cliente es solo para mostrar.
- El estado se organiza para que el #9 agregue `personas` sin cambiar la versión de lo existente (campo opcional).
- *Alternativa:* estado en la URL. Descartada por el ADR 0008.

### 6. Pantallas y navegación
- **Horarios elegibles:** en `PantallaDisponibilidad` cada horario es un `<button>` (componente cliente `HorarioElegible`) que llama a `iniciarSeleccion` y navega a `/reservar` con `router.push`. El texto de "solo informativos" desaparece.
- **`/reservar`:** una página sin base de datos con el componente cliente `PasoConfirmacion`: lee `sessionStorage` tras montar (no hay estado en el servidor), muestra el resumen (fecha y hora de Lima, duración, precio exacto), campos de nombre y teléfono con los valores guardados, que se persisten al escribir, y campos ocultos con la clave y los identificadores. `useActionState` conecta con `confirmarReserva`: en `ok` borra el estado y navega a `/reservas/<token>`; en `horario_no_disponible` muestra el aviso y un enlace a `/servicios/<id>/disponibilidad?maquilladora=<id>` conservando todo; en `invalido` muestra errores por campo. El botón se deshabilita mientras envía. Sin estado válido muestra "No hay una reserva en curso" con un enlace al catálogo.
- **`/reservas/[token]`:** valida el token con `z.uuid()` (si no, `notFound()`), lee dentro de `<Suspense>` con `obtenerReservaPorToken` y muestra el estado con un texto por cada uno de los cuatro estados, el servicio, la maquilladora, día y hora de Lima y el monto. No selecciona teléfono, número de operación ni token en la lectura. Incluye el aviso de guardar el enlace.
- **Protección del enlace:** `next.config.ts` agrega para `/reservas/:path*` y `/reservar` las cabeceras `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` y `Referrer-Policy: no-referrer`, como ya hace con `/admin`.
- *Alternativa:* un `redirect()` desde la acción. Más simple, pero el cliente no podría borrar su estado de forma fiable antes de que la página se desmonte.

### 7. Lectura por token
`obtenerReservaPorToken(db, token)` (`src/lib/reserva/estado.ts`) hace un `JOIN` de `reserva` con sus líneas, servicio y maquilladora y devuelve estado, monto, creación y las líneas (persona, servicio, maquilladora, inicio, fin, precio), sin teléfono, sin número de operación y sin token. Devuelve líneas (no una sola) para que el #9 no cambie el contrato; incluye líneas inactivas para poder mostrar una reserva cancelada.

### 8. Pruebas
- Unitarias: esquemas (nombre vacío o de 101, teléfono con letras, de 6 y de 16 dígitos, con `+`, con formato; instante inválido), traducción de códigos Postgres (incluido el error envuelto en `cause`), módulo del asistente con un `Storage` falso (dañado, otra versión, clave nueva, contacto conservado), acciones con las dependencias simuladas, componentes (`HorarioElegible`, `PasoConfirmacion`, página de estado) y las cabeceras de `next.config.ts`.
- Integración con Postgres real: creación (reserva y línea, estado, monto, token, `fin` por duración), precio copiado ante un cambio posterior del catálogo, todo o nada, horario ocupado, inventado, pasado, bloqueado y fuera de grilla, servicio y maquilladora inactivos, idempotencia (reenvío, misma clave simultánea, clave distinta por el mismo horario, reenvío después de que el horario dejó de ofrecerse), y **dos reservas simultáneas por el mismo horario** (una gana, la otra recibe `horario_no_disponible`, sin filas a medias, repetida varias veces para cubrir el `40P01`).
- Rutas: `curl` sobre `npm run start` (`/reservar` 200 sin sesión con cabeceras de protección; `/reservas/abc` muestra "no encontrado").

## Risks / Trade-offs

- **Reservas abandonadas siguen ocupando** → sin el vencimiento del #8, una reserva `pendiente_pago` que nunca paga traba su horario. Es el comportamiento del ADR 0003 hasta ese ítem; el studio puede cancelarla desde el panel cuando exista (#11) y, mientras tanto, desde la base.
- **Quien tenga el enlace ve la reserva** (ADR 0004) → se mitiga con un token no adivinable, cabeceras que impiden cachearlo, indexarlo o filtrarlo, y sin mostrar el teléfono.
- **Se pueden crear reservas sin pagar sin límite** → aceptado en el ADR 0003 (sin tope por teléfono).
- **La columna nueva exige migrar Neon** → es la primera migración desde #3; debe aplicarse con `npm run db:migrate` antes de desplegar el código. Sin ella, la creación falla con un error de columna inexistente.
- **Estado perdido al cerrar la pestaña** (ADR 0008) → la clienta vuelve a elegir; con el contacto escrito solo se pierde en una pestaña nueva.
- **Un `sessionStorage` bloqueado** (navegación privada estricta) → el asistente no puede avanzar; se muestra "no hay una reserva en curso" en lugar de fallar en silencio.
- **Se muestra el precio sin símbolo** (pregunta abierta heredada de #4 y #6).
- **El nombre de la clienta es la "persona a maquillar"** → válido para el individual; en el grupal (#9) cada integrante tendrá su nombre y el contacto seguirá siendo el de quien reserva.

## Migration Plan

1. Agregar la columna y generar la migración con `npm run db:generate`; revisar el SQL y comprobar que un segundo `db:generate` responde "No schema changes".
2. Aplicar a Neon con `npm run db:migrate` **antes** de desplegar el código (requiere confirmar con el responsable, porque escribe en la rama de producción).
3. Rollback: las migraciones solo avanzan. La columna es opcional, así que el código anterior sigue funcionando con ella presente; revertir el despliegue basta.

## Open Questions

- ¿El teléfono debe validarse para un país concreto? Hoy se aceptan 7 a 15 dígitos con formato libre.
- ¿Hay que pedir además un correo o algún otro dato de contacto? El esquema solo guarda nombre y teléfono.
- ¿Cuánto tiempo debe vivir una reserva sin pagar antes de que el studio la libere a mano mientras llega el #8?
