# Design

## Context

Estado de partida (ítems #1 a #5): el panel ya carga servicios, maquilladoras, `horario_trabajo` y `bloqueo_agenda`, y la base garantiza con `reserva_linea_sin_solapamiento` que una maquilladora no tenga dos líneas activas solapadas (rangos semiabiertos). La portada (`src/app/page.tsx`) es solo un título y no hay rutas públicas de datos. Ya existen `ZONA_STUDIO = "America/Lima"` con `deLocalAInstante` y `aPartesLocales` (`src/lib/agenda/zona-horaria.ts`), `listarHorarios` (`src/lib/agenda/horarios.ts`), el patrón de capas con la base inyectada y los componentes shadcn `badge`, `button`, `input`, `label`, `table`, `textarea`. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0006: lecturas en Server Components con Drizzle, sin endpoints REST. ADR 0010: shadcn/ui, mobile-first en el sitio público. ADR 0003: toda línea activa ocupa el horario (el vencimiento lazy es del ítem #8).
- Next 16 con `cacheComponents`: lo que lee la petición (`params`, `searchParams`) o la base va detrás de `<Suspense>`; no se usa `'use cache'` en este ítem.
- `horario_trabajo` guarda hora de pared sin zona (0 = domingo) y `bloqueo_agenda` / `reserva_linea` guardan `timestamptz`: el cruce exige convertir cada tramo a instantes con la zona del studio, nunca con la zona del proceso.
- Postgres sigue siendo la garantía final contra el solapamiento; la pantalla es informativa y puede quedar desactualizada al instante de reservar (el #7 maneja ese choque).

## Goals / Non-Goals

**Goals:**
- Un cálculo de huecos puro, sin base ni reloj implícito (recibe `ahora`), probado a fondo, que el #7 pueda reutilizar para validar el horario elegido y el #8 para sumar el vencimiento.
- Una consulta con la base inyectada que carga solo lo necesario de los próximos 30 días.
- Rutas públicas sin sesión, con enlaces compartibles (sin estado de cliente: el asistente y `sessionStorage` son del #7).

**Non-Goals:**
- Reservar, conservar la selección entre pantallas o validar contra la base al elegir (#7).
- Vencimiento a 20 minutos de reservas sin pago (#8). Hasta entonces toda línea activa ocupa.
- Caché del catálogo o de la disponibilidad, y la invalidación asociada.
- Una configuración editable de la grilla, del horizonte o de la zona desde el panel.

## Decisions

### 1. Cálculo de huecos como función pura
`src/lib/disponibilidad/huecos.ts` exporta `calcularHuecos({ tramos, ocupados, duracionMinutos, ahora })` donde `tramos` es el horario semanal (día 0–6 → tramos `HH:mm`), `ocupados` es la unión de bloqueos y líneas activas como rangos de instantes, y devuelve, por cada uno de los próximos 30 días con al menos un hueco, la fecha local (`YYYY-MM-DD`) y los instantes de inicio. Para cada día: se toman los tramos de su día de la semana, se ordenan y se **fusionan** los contiguos o solapados; dentro de cada tramo fusionado se recorre desde su inicio en pasos de 30 minutos mientras `inicio + duración <= fin del tramo`; cada candidato se convierte a instante con `deLocalAInstante` (si la hora local no existe, se descarta); se excluye si `inicio < ahora` o si su rango `[inicio, inicio + duración)` se solapa con algún ocupado (`inicio < finOcupado && fin > inicioOcupado`, semiabierto).
- La grilla de 30 minutos y el horizonte de 30 días viven en `src/lib/disponibilidad/constantes.ts` (`INTERVALO_MINUTOS`, `DIAS_HORIZONTE`).
- *Alternativa:* calcular en SQL con `generate_series` y rangos. Menos datos en memoria, pero mezcla reglas de zona horaria y grilla en consultas difíciles de probar y de reutilizar; el volumen (≈30 días × decenas de huecos × pocas filas) no lo justifica.

### 2. Fechas locales sin librerías
`src/lib/disponibilidad/fechas.ts` ofrece `hoyLocal(ahora)` (la fecha de Lima de un instante), `sumarDias(fecha, n)` y `diaDeLaSemana(fecha)`. Operan sobre la fecha de calendario `YYYY-MM-DD` con `Date.UTC` (sin horario de verano en juego) y reutilizan `aPartesLocales` para saber "qué día es en Lima ahora". Así un servidor en UTC a las 22:00 del 24/12 en Lima (03:00 UTC del 25) sigue considerando "hoy" el 24.
- *Alternativa:* `Temporal` o una librería de fechas. Descartada: no hay dependencia nueva que justifique, y lo necesario cabe en tres funciones.

### 3. Qué ocupa el horario y qué se carga
`consultarDisponibilidad(db, { servicio, maquilladoraId, ahora })` en `src/lib/disponibilidad/consulta.ts` carga, solo de esa maquilladora y de la ventana `[ahora, fin del día 30)`: sus tramos (`listarHorarios`), sus bloqueos que cruzan la ventana y sus líneas con `activa = true` que cruzan la ventana. Llama a `calcularHuecos` y devuelve los días con huecos. No se filtra por estado de la reserva: una `pendiente_pago` con línea activa ocupa agenda (ADR 0003). El punto de extensión del #8 es esa consulta de líneas (ahí se excluirán las vencidas), sin tocar el cálculo.
- Los ocupados se pasan al cálculo como rangos anónimos: la capa pública nunca ve nombres ni teléfonos (spec: sin datos de otras clientas), porque la consulta solo selecciona `inicio` y `fin`.
- *Alternativa:* una vista o consulta única con joins. No aporta: son tres lecturas simples en paralelo.

### 4. Lecturas públicas separadas de las del panel
`src/lib/publico/catalogo.ts`: `listarServiciosActivos` (por nombre), `obtenerServicioActivo`, `listarMaquilladorasActivas` y `obtenerMaquilladoraActiva`. Se separan de `src/lib/catalogo/` porque las del panel devuelven inactivos y las públicas nunca deben hacerlo; así un cambio en una no filtra datos en la otra.

### 5. Rutas y estado en la URL
- `/`: catálogo (reemplaza el título actual).
- `/servicios/[servicioId]/disponibilidad?maquilladora=<id>&fecha=<YYYY-MM-DD>`: elige maquilladora (enlaces con `?maquilladora=`), luego día (enlaces con `&fecha=`) y muestra los horarios del día. Toda la selección vive en la URL: se puede compartir, funciona sin JavaScript y no necesita estado de cliente (el estado del asistente es del #7, ADR 0008).
- Validación: `servicioId` con `idSchema` y `notFound()` si es inválido, inexistente o inactivo; `maquilladora` y `fecha` con un esquema Zod propio que **nunca lanza**: una maquilladora inválida o inactiva equivale a "sin elegir", y una fecha inválida o sin horarios equivale a "el primer día con disponibilidad".
- Las páginas leen la base y los parámetros dentro de `<Suspense>`, sin `'use cache'`.
- *Alternativa:* un asistente con estado en el cliente desde ya. Descartada: duplicaría el trabajo del #7 sin poder reservar todavía.

### 6. Presentación mobile-first
Lista de servicios en tarjetas de una columna que pasan a rejilla en pantallas anchas; elección de maquilladora y de día como enlaces con aspecto de botones (`buttonVariants`), y los horarios como una rejilla de píldoras no interactivas con la hora `HH:MM` (el #7 las vuelve elegibles). El día seleccionado se marca con texto y `aria-current`, no solo con color. Fechas en español (`lunes 24 de diciembre`) con `Intl.DateTimeFormat("es")` y `timeZone: "UTC"` sobre la fecha de calendario, para no desplazar el día. El precio se muestra con dos decimales sin símbolo, como en el panel (pregunta abierta sobre la moneda).

### 7. Pruebas
- Unitarias del cálculo con una tabla de casos tomada de la spec (cabe/no cabe, dos tramos, contiguos, bloqueo en medio y de varios días, línea contigua, grilla anclada a las 09:15, "hoy" a las 10:10, horizonte de 30 días, día sin tramos) y con distintos `TZ` del proceso.
- Integración con Postgres real: la consulta con líneas activas, inactivas, pendiente de pago y de otra maquilladora, bloqueos multidía, solo maquilladoras y servicios activos, y que la consulta no selecciona datos personales.
- Componentes: catálogo (activos, sin descripción, vacío, precio exacto), selectores (activa marcada, sin preselección) y lista de horarios.
- Rutas: `curl` sobre `npm run start` comprobando que `/` y la disponibilidad responden sin sesión y que un identificador inválido responde 404.

## Risks / Trade-offs

- **Información desactualizada al reservar** → la pantalla puede mostrar libre un horario que otra clienta acaba de tomar. Es inherente (sin bloqueo temporal, ADR 0003) y lo resuelve el #7 con la exclusión en Postgres y el mensaje "horario ya no disponible"; la consulta no se cachea para acortar la ventana.
- **Reservas vencidas siguen ocupando** → hasta el #8 una `pendiente_pago` abandonada oculta su horario aunque ya hayan pasado 20 minutos. Es el lado seguro (nunca se ofrece algo ocupado) y queda acotado por el punto de extensión de la decisión 3.
- **Grilla de 30 minutos y 30 días son supuestos** → no vienen del PRD. Viven en constantes y en las specs; cambiarlos es una línea y una prueba, pero conviene confirmarlos con el studio.
- **Zona horaria `America/Lima` sigue sin confirmarse** (heredado de #5): un error desplaza todos los horarios ofrecidos.
- **Una consulta por cada visita** (sin caché) → carga Neon en cada vista; con el volumen de un studio y el reintento acotado del ítem #1 se acepta. Si el tráfico crece se puede cachear el catálogo, no la disponibilidad.
- **Sin descubrimiento de "primer día libre" entre todas las maquilladoras** → la clienta debe probar maquilladora por maquilladora; la elección directa es un requisito del PRD y una vista agregada queda fuera de alcance.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega como código; la portada deja de ser un título. Rollback: revertir el despliegue; no hay datos propios de este ítem.

## Open Questions

- ¿La grilla de 30 minutos y la ventana de 30 días le sirven al studio? Son constantes; cambiarlas no altera el diseño.
- ¿Debe existir una anticipación mínima para reservar (por ejemplo, no ofrecer lo que empieza en menos de una hora)? Hoy solo se excluye lo que ya empezó; se puede agregar con una constante.
- ¿Qué moneda y formato mostrar junto al precio? Mientras tanto se muestra el monto con dos decimales y sin símbolo.
