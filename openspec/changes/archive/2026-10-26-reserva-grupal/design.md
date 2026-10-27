# Design

## Context

Estado de partida (#1 a #7): `reserva` y `reserva_linea` ya admiten N líneas por reserva (ADR 0005) y la exclusión `reserva_linea_sin_solapamiento` impide dos líneas activas solapadas por maquilladora (ADR 0003). `crearReservaIndividual` (`src/lib/reserva/crear.ts`) hace: atajo por `clave_idempotencia`, carga de servicio y maquilladora activos, `consultarDisponibilidad` **fuera** de la transacción, `db.transaction` solo con los inserts de `reserva` y `reserva_linea`, y traducción de `23P01`/`40P01` a `horario_no_disponible` tras re-buscar la clave. El asistente (`src/lib/reserva/asistente.ts`, `version: 1`) guarda un `servicio`, una `maquilladora`, un `inicio` y el `contacto` en `sessionStorage`; el diseño de #7 dejó anotado que #9 agregaría `personas` como campo opcional. La página de estado (`obtenerReservaPorToken`) ya devuelve todas las líneas ordenadas por inicio. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0005: una reserva con N líneas, un token, un estado, un monto total; el contacto es de quien reserva. ADR 0003: la exclusión por línea es la garantía final. ADR 0008: estado en cliente con `sessionStorage`; el choque se muestra y se vuelve al paso de horario conservando el resto. ADR 0009: una transacción por creación, traducción del choque, idempotencia por clave, validación con Zod.
- Un cliente de transacción de `pg` no admite consultas en paralelo (deprecado): dentro de la transacción todo va en serie.
- Una violación de exclusión **aborta la transacción entera** en Postgres: tras un `23P01` o `40P01` no se puede seguir consultando dentro de ella.
- Next 16 con `cacheComponents`, zona del studio `America/Lima` (`src/lib/agenda/zona-horaria.ts`), pruebas de integración con Postgres real (ADR 0011).

## Goals / Non-Goals

**Goals:**
- Que un grupo exista completo o no exista, sin duplicados por reenvío y sin quedarse con un horario que no se ofrecía.
- Que la clienta sepa **qué integrante** chocó y no pierda a las demás.
- Que las reglas del grupo (solapamientos, suma de precios) sean funciones puras probadas sin base ni Next.
- Que la reserva individual no cambie de comportamiento.

**Non-Goals:**
- Pago, vencimiento, cancelación o reprogramación de una integrante suelta, panel y descuentos por grupo.
- Persistir borradores de grupo en el servidor (descartado en ADR 0008).

## Decisions

### 1. Supuesto: cada integrante tiene su propio servicio, maquilladora y horario
Cada línea del grupo es independiente: un elenco se maquilla en paralelo con varias maquilladoras y con servicios distintos. Compartir servicio y maquilladora para todas queda como caso particular (la clienta elige lo mismo para cada una). Se registra como supuesto y como pregunta abierta; no contradice ningún ADR. Consecuencia: la creación revalida **cada línea con su propio servicio y maquilladora** y el monto es la suma de precios posiblemente distintos.
- *Alternativa:* un solo servicio y maquilladora para todas, con horarios consecutivos. Más simple pero no cubre el elenco en paralelo ni servicios distintos; el esquema del servidor igual admite el caso particular.

### 2. Supuesto: tamaño del grupo de 2 a 10
Constantes `MIN_INTEGRANTES = 2` y `MAX_INTEGRANTES = 10` en `src/lib/reserva/grupo.ts`. El PRD no fija un tope; 10 acota la carga de revalidación (cada línea cuesta consultas), el tamaño del JSON del formulario y del `sessionStorage`, y cubre un elenco típico. Un grupo de una persona es una reserva individual y se rechaza como grupal. Pregunta abierta: confirmar el máximo con el studio.

### 3. Esquema de la solicitud grupal
`src/lib/reserva/esquemas.ts` agrega `integranteSchema` (`nombre` con `nombreSchema`, `servicioId` y `maquilladoraId` con `idSchema`, `inicio` instante ISO → `Date`) y `solicitudGrupalSchema`: `clave` (`uuid`), `nombre` y `telefono` de quien reserva (los mismos `nombreSchema` y `telefonoSchema`), `personas` (arreglo de `MIN_INTEGRANTES` a `MAX_INTEGRANTES` integrantes). En el formulario, `personas` viaja como **un campo oculto con JSON**; el servidor lo parsea con `JSON.parse` dentro de un `try` y lo valida con Zod (un JSON roto o de otro tipo es "solicitud inválida"). La presencia del campo `personas` decide el camino: sin él, la solicitud se valida con `solicitudReservaSchema` como hoy.
- Los errores por integrante salen con ruta (`personas.2.nombre`): se agrega `erroresPorRuta(error)` en `esquemas.ts` (convierte `issue.path` en `"personas.2.nombre"`), porque `erroresPorCampo` de `src/lib/catalogo/esquemas.ts` solo aplana el primer nivel. No se modifica `erroresPorCampo`.
- *Alternativa:* campos repetidos `personas[0][nombre]` en el `FormData`. Más frágil de parsear y de repoblar; el JSON único se valida de una vez.
- *Alternativa:* dos Server Actions (individual y grupal). La acción única con despacho evita duplicar la protección y el manejo de `useActionState`.

### 4. Reglas puras del grupo (`src/lib/reserva/grupo.ts`)
- `detectarSolapamientos(lineas)`: recibe `{ indice, maquilladoraId, inicio, fin }[]` y devuelve los pares de índices con la misma maquilladora y `inicioA < finB && finA > inicioB` (semiabierto: turnos contiguos no se solapan). Es lo que da el error claro `solapa_con_otra_integrante` antes de tocar la base, en lugar de esperar a que la exclusión aborte la transacción.
- `sumarPrecios(precios: string[])`: suma exacta de decimales con dos cifras convirtiendo a centavos enteros (`numeric(10,2)` llega como texto) y devuelve el texto con dos decimales. Nada de `Number` de punto flotante.
- Constantes `MIN_INTEGRANTES` y `MAX_INTEGRANTES`.

### 5. Creación grupal: `crearReservaGrupal` en un archivo nuevo
`src/lib/reserva/crear-grupal.ts` exporta `crearReservaGrupal(db, solicitud, ahora)` (base inyectada, sin Next). Se coloca en un archivo propio para no reescribir `crear.ts`, que el ítem #8 también modifica; solo se **exporta** `tokenDeLaClave` desde `crear.ts` (un cambio de una palabra) para reutilizar la búsqueda por clave.

Pasos:
1. **Atajo de idempotencia:** si la clave ya creó una reserva, devuelve su token (`repetida: true`) sin revalidar.
2. **Carga de catálogo en serie:** para cada `servicioId` y cada `maquilladoraId` distintos del grupo, `obtenerServicioActivo` y `obtenerMaquilladoraActiva`, una consulta tras otra (máximo 10 + 10, con deduplicación). Si falta alguno, esa integrante queda en `noDisponibles`.
3. **Solapamientos internos:** con los inicios y `fin = inicio + duración del servicio de esa integrante`, `detectarSolapamientos`. No corta: se acumulan los problemas para informarlos todos juntos.
4. **Revalidación de cada línea:** se agrupa por par (maquilladora, duración) y se llama a `consultarDisponibilidad(db, { servicio, maquilladoraId, ahora })` **una vez por par distinto**, en serie; cada integrante exige que su instante figure entre los inicios ofrecidos. Las que no, van a `horariosNoDisponibles`. Se hace fuera de la transacción por la misma razón que en #7 (lecturas que no deben retener la transacción) y porque lo que garantiza la ausencia de choques es la exclusión de Postgres.
5. Si hay algún problema, antes de rechazar se **vuelve a buscar la clave**: otro envío con la misma clave pudo confirmar mientras tanto y entonces los horarios ya no se ofrecen porque son suyos. Si existe, se devuelve su token; si no, se devuelve `{ estado: "rechazada", noDisponibles, horariosNoDisponibles, solapamientos }`.
6. **`db.transaction` solo con los inserts, en serie:** primero la `reserva` (`estado` por defecto `pendiente_pago`, nombre y teléfono de quien reserva, `montoTotal = sumarPrecios(...)`, clave) y luego cada `reserva_linea` en orden de integrante, con `await` entre una y otra. Antes de cada línea se anota en una variable externa el índice de la integrante, para saber cuál falló.
7. **Traducción de errores** fuera de la transacción (tras un error Postgres aborta la transacción): `23P01` y `40P01` → se vuelve a buscar la clave y, si no hay reserva con ella, se repite la revalidación (pasos 2 y 4) para señalar **todas** las integrantes cuyo horario ya no se ofrece; si por la carrera esa revalidación no encuentra ninguna, se señala la integrante cuyo insert falló (la anotada en el paso 6). `23505` sobre `reserva_clave_idempotencia_unica` → se devuelve la reserva existente. Cualquier otro error se relanza (llega a la página de error amigable de #1).

Resultado:
```ts
type ResultadoGrupo =
  | { estado: "creada"; token: string; repetida: boolean }
  | { estado: "rechazada";
      noDisponibles: number[];          // servicio o maquilladora inactivos
      horariosNoDisponibles: number[];  // índices de integrantes
      solapamientos: [number, number][] } // pares de índices
```
Los índices son las posiciones del arreglo `personas` enviado.
- *Alternativa:* reutilizar `crearReservaIndividual` N veces. Rompe el todo o nada y crea N tokens.
- *Alternativa:* `INSERT` de todas las líneas en una sola sentencia. Perdería el índice de la que falló; con 10 inserts máximos en serie el costo es bajo.
- *Alternativa:* `SELECT … FOR UPDATE` de las maquilladoras para serializar grupos. Evitaría el `40P01` pero serializa todas las reservas; basta con traducir ambos códigos (igual que en #7).

### 6. Punto de integración con el vencimiento lazy (#8)
El diseño no depende de los detalles de #8, pero declara el contrato: la inserción de **una** línea debe poder pasar por la misma rutina que #8 defina para "si choca con una reserva vencida, cancelarla y reintentar". Concretamente:
- La inserción de cada línea del grupo se aísla en una función local `insertarLinea(tx, linea)` en `crear-grupal.ts`. Si #8 expone un helper para insertar liberando vencidas, `insertarLinea` lo llama y nada más cambia; si no existe todavía, hace el insert simple.
- Como un `23P01` aborta la transacción, "reintentar dentro de la transacción" exige un **savepoint por línea** (`tx.transaction(...)` anidado de Drizzle) o una verificación previa del conflicto; eso es decisión de #8, y el grupo debe aplicarlo **a cada línea**.
- **Todo o nada sigue valiendo:** si una línea no se puede liberar (la reserva en conflicto ya no es vencida), la transacción externa se revierte, **incluidas las cancelaciones por vencimiento hechas para las líneas anteriores**. Es el comportamiento deseado: no se cancela a nadie por un grupo que no llegó a crearse.
- La revalidación del paso 4 usa `consultarDisponibilidad`; cuando #8 haga que esa consulta trate las vencidas como libres, el grupo hereda el cambio sin tocar nada.
- Archivos compartidos con #8: solo `crear.ts` (este change solo exporta `tokenDeLaClave`; #8 reorganiza el insert) y, solo por lectura, `consulta.ts`. Si #8 renombra o mueve `tokenDeLaClave` o `RESTRICCION_CLAVE`, `crear-grupal.ts` debe seguirlo.

### 7. Server Action y confirmación
`confirmacion.ts`: `procesarConfirmacion` detecta el campo `personas`. Sin él, el camino individual no cambia. Con él, parsea y valida `solicitudGrupalSchema` y llama a `deps.crearGrupo`. `ResultadoConfirmacion` gana `{ estado: "grupo_rechazado"; noDisponibles; horariosNoDisponibles; solapamientos }`, y en `invalido` los `errores` incluyen las rutas por integrante (`personas.2.nombre`); los `valores` repueblan quien reserva. `actions.ts` pasa ambas dependencias (`crear` y `crearGrupo`) a `procesarConfirmacion`; sigue sin usar `requerirAdmin()` (las clientas no tienen cuenta).

### 8. Estado del asistente: campo opcional `personas`
`asistente.ts` agrega, sin cambiar `version: 1` ni lo existente, el campo opcional `personas`: arreglo de integrantes `{ id, nombre, servicio?, maquilladora?, inicio? }` (`id` local estable, `crypto.randomUUID()`), más `personaActiva?` (id de la integrante cuyo horario se está eligiendo). Un estado sin `personas` es la reserva individual de siempre; un estado con `personas` mal formado hace que **todo** el estado se ignore (como un estado dañado hoy). Nuevas funciones puras que reciben el `Storage`: `activarGrupo` (crea la lista con la primera integrante tomada de la selección actual y el nombre de contacto), `agregarIntegrante` (rechaza pasado `MAX_INTEGRANTES`), `quitarIntegrante`, `renombrarIntegrante`, `elegirParaIntegrante`, `marcarActiva` y `integrantesIncompletas` (qué le falta a cada una).
- Cualquier cambio en las selecciones de las integrantes (agregar, quitar, elegir horario) **genera una clave nueva**, igual que elegir otro horario en el individual: la clave identifica un contenido, y reutilizarla con otro contenido devolvería la reserva anterior.
- Renombrar una integrante no cambia la clave (no cambia lo que se reserva más allá del texto, y el reenvío tras un error de validación debe seguir siendo el mismo intento).
- *Alternativa:* subir la versión del estado a 2. Descartada: invalidaría un estado individual guardado en una pestaña abierta; el campo opcional lo evita (ya lo anotó el diseño de #7).

### 9. Pantallas y navegación
- **`/reservar`:** `PasoConfirmacion` conserva su camino individual. Un interruptor "Reservar para un grupo" lo pasa a modo grupal y muestra `ListaIntegrantes` (nuevo componente cliente en `src/components/publico/`): por integrante, nombre editable, resumen de servicio, maquilladora, día y hora de Lima (o "Falta elegir el horario"), botones "Elegir horario" (marca la integrante activa y navega al catálogo `/`, o directo a `/servicios/<id>/disponibilidad?maquilladora=<id>` si ya tenía selección) y "Quitar". "Agregar integrante" se deshabilita en 10 con una nota. El botón "Confirmar reserva" se deshabilita mientras `integrantesIncompletas` no sea vacío y se lista qué falta. Muestra el monto total calculado con `sumarPrecios` (solo para mostrar; el servidor recalcula).
- **Elegir horario por integrante:** `HorarioElegible` consulta el estado: si hay `personaActiva`, llama a `elegirParaIntegrante` (asigna y limpia `personaActiva`) en lugar de `iniciarSeleccion`, y vuelve a `/reservar`. Sin `personaActiva`, se comporta exactamente como hoy.
- **Choque parcial:** la respuesta `grupo_rechazado` marca a las integrantes afectadas en la lista (`horariosNoDisponibles`: "Ese horario ya no está disponible"; `noDisponibles`: "Este servicio o maquilladora ya no están disponibles"; `solapamientos`: "Se solapa con <nombre>" en ambas). No se borra nada; "Elegir otro horario" marca a la integrante como activa y lleva a la disponibilidad de su misma maquilladora. Al volver a elegir, `elegirParaIntegrante` genera clave nueva.
- **Éxito:** igual que el individual: `borrarAsistente` y navegar a `/reservas/<token>`.
- **Página de estado:** `EstadoDeReservaVista` ya itera las líneas; se cambia la `key` de cada tarjeta (hoy `persona-inicio`, que colisiona con dos homónimas a la misma hora) por el índice, el título pasa a "Tus turnos" cuando hay más de uno y se muestra el nombre de la integrante, el monto total aclarado "del grupo" si hay varias líneas. El estado y el token son únicos. `obtenerReservaPorToken` no cambia.

### 10. Pruebas
- Unitarias: `detectarSolapamientos` (pisado parcial, mismo horario, contiguos, distinta maquilladora, tres integrantes), `sumarPrecios` (350.50 + 120.10 + 80.00 = 550.60, enteros, ceros), `solicitudGrupalSchema` (1 y 11 integrantes, nombre vacío o de 101, JSON roto, `personas` no arreglo, rutas de error), `erroresPorRuta`, el asistente con un `Storage` falso (activar, agregar hasta 10, quitar, elegir para integrante, clave nueva al cambiar selecciones y no al renombrar, estado individual previo, `personas` dañado), `procesarConfirmacion` con dependencias simuladas, y componentes (`ListaIntegrantes`, `PasoConfirmacion` modo grupal, `HorarioElegible` con `personaActiva`, `EstadoDeReservaVista` con homónimas).
- Integración con Postgres real (ADR 0011): grupo de tres con servicios y maquilladoras distintos (líneas, `fin` por servicio, monto 550.60, un token); todo o nada con fallo inyectado en la tercera línea; una línea ocupada entre libres (no queda nada, se señala la correcta); solapamiento interno sin que lo detecte Postgres; contiguas válidas; servicio inactivo; idempotencia (reenvío, misma clave simultánea, reenvío cuando ya no se ofrecen los horarios); dos grupos simultáneos por el mismo horario repetidos varias veces (cubre `40P01`); grupo contra reserva individual; precio copiado ante un cambio de catálogo.
- Rutas: `curl` sobre `npm run start` solo si no choca con otro agente; si no, queda para verificación manual.

## Risks / Trade-offs

- **Un choque a mitad de un grupo grande es incómodo** → se mitiga señalando exactamente qué integrantes fallaron y conservando el resto; no hay bloqueo temporal (ADR 0003 y 0008).
- **Un grupo de 10 ocupa 10 horarios sin pagar** → el vencimiento lazy (#8) lo acota en tiempo; no hay tope por teléfono (decisión aceptada en ADR 0003) y un grupo amplifica ese riesgo: una reserva abandonada traba N horarios en vez de uno.
- **Costo de la revalidación** → hasta 10 pares (maquilladora, duración) distintos, cada uno con tres lecturas en serie; se acota con el máximo de 10 y la deduplicación por par.
- **`sessionStorage` perdido con un grupo grande** (consecuencia ya aceptada en ADR 0008) → hay que volver a cargar a todas las integrantes.
- **La clave cubre el contenido, no solo el intento** → si el cliente cambiara la selección sin cambiar la clave, el servidor devolvería la reserva anterior; por eso el asistente regenera la clave al cambiar cualquier selección.
- **Lo que no se puede deshacer por integrante** → hasta #12 y #13 cancelar o reprogramar actúa sobre la reserva completa; una integrante que no puede asistir obliga a cancelar todo (queda como pregunta para esos ítems).
- **Conflicto de archivos con #8** → mitigado con un archivo propio para la creación grupal y un único cambio de una palabra en `crear.ts`.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega como código; el flujo individual no cambia. Rollback: revertir el despliegue; las reservas grupales ya creadas siguen siendo válidas porque usan el modelo existente.

## Open Questions

- ¿Cada integrante puede elegir su propio servicio, maquilladora y horario? Se asumió que sí (decisión 1); si el studio prefiere un solo servicio y maquilladora por grupo, se simplifica el asistente pero no el servidor.
- ¿Cuál es el tamaño máximo del grupo? Se asumió 10 (decisión 2); no hay dato del PRD.
- ¿Debe haber un descuento o un trato distinto para grupos? No está en el PRD; no se contempla.
- ¿Quien reserva forma parte del grupo? Se asumió que no necesariamente: el nombre de contacto y el de la primera integrante se inicializan iguales pero son editables por separado.
- ¿Qué pasa si una integrante no puede asistir después de reservar? Corresponde a los ítems #12 y #13; aquí solo se cancela o reprograma todo.
