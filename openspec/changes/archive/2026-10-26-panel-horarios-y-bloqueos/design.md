# Design

## Context

Estado de partida (ítems #1 a #4): las tablas `horario_trabajo` (`maquilladora_id`, `dia_semana` 0–6 con 0 = domingo, `hora_inicio` y `hora_fin` de tipo `time`, CHECK de día válido y fin posterior) y `bloqueo_agenda` (`maquilladora_id`, `inicio` y `fin` `timestamptz`, `motivo` obligatorio, CHECK de fin posterior) existen, con clave foránea `ON DELETE RESTRICT` hacia `maquilladora`. Ninguna otra tabla las referencia. El panel tiene `requerirAdmin()` (acciones) y `requerirAdminOLogin()` (páginas), el patrón de sección de #4 (capa de datos con la base inyectada en `src/lib/catalogo/`, `procesar*` en `formularios.ts`, acciones delgadas, `useActionState`) y una prueba de convención que exige `await requerirAdmin()` como primera línea de todo `actions.ts` bajo `src/app/admin/`. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0006: lecturas en Server Components, escrituras en Server Actions, Zod en el servidor y sesión verificada en cada acción. ADR 0010: shadcn/ui. ADR 0005: modelo ya fijado, sin migraciones en este ítem.
- Next 16 con `cacheComponents`: la sesión se lee en tiempo de petición, detrás de `<Suspense>`; `params` es una promesa y los tipos `PageProps<...>` se generan con `next build`.
- El servidor corre en UTC (Vercel) y el navegador de la administradora puede tener otra zona: la conversión entre hora local del studio y `timestamptz` no puede depender de la zona del proceso ni del navegador.
- `hora_inicio`/`hora_fin` son `time` sin zona: ya son "hora de pared del studio" (el comentario del esquema lo dice), no necesitan conversión.

## Goals / Non-Goals

**Goals:**
- Que #6 (disponibilidad) y #14 (agenda) lean horarios y bloqueos con funciones ya probadas, sin reinventar la lectura.
- Que la lógica de escritura se pruebe contra Postgres real sin montar Next, igual que en #4.

**Non-Goals:**
- Calcular disponibilidad, expandir horarios a fechas concretas o cruzarlos con reservas (#6).
- Impedir carreras entre dos administradoras que editen la misma agenda a la vez.
- Una restricción de exclusión en la base para tramos solapados: exigiría una migración y el solapamiento de tramos es inofensivo para la disponibilidad (la unión de tramos es la misma); la regla vive en la aplicación.

## Decisions

### 1. Una pantalla de agenda por maquilladora, bajo la ruta de la maquilladora
`/admin/maquilladoras/[id]/agenda` muestra horario semanal y bloqueos en una sola página, con un formulario de alta por bloque y un botón "Quitar" por fila. Se llega desde el listado y desde la edición de maquilladoras. La página lee la sesión con `requerirAdminOLogin()` dentro de `<Suspense>`, valida `id` con el `idSchema` existente y usa `notFound()` si es inválido o no existe; no se filtra por `activa`, para poder preparar la agenda antes de reactivar a una maquilladora.
- *Alternativa:* una sección global `/admin/agenda` con selector de maquilladora. Más pasos para el caso común (cargar la agenda de una persona) y duplica la validación del `id`.

### 2. Zona horaria del studio como constante única, `America/Lima`
Un módulo `src/lib/agenda/zona-horaria.ts` exporta `ZONA_STUDIO = "America/Lima"` y dos funciones: de "fecha y hora local" (texto `YYYY-MM-DDTHH:mm`, el formato de `<input type="datetime-local">`) a `Date` UTC, y de `Date` a esas partes locales para mostrar. Se implementan con `Intl.DateTimeFormat` y `timeZone`, sin librerías nuevas. Lima no tiene horario de verano, pero la conversión no asume un desfase fijo: se calcula con `Intl`, de modo que cambiar la constante basta si el studio estuviera en otra zona. Se rechazan horas locales inexistentes o ambiguas (saltos de horario de verano) en vez de adivinar.
- *Supuesto a confirmar:* que el studio opera en hora de Lima. No viene del PRD; el nombre "billetera electrónica" y el equipo sugieren Perú, pero no está escrito. Es la única decisión de este ítem que cambia datos guardados si resulta errónea.
- *Alternativa:* usar la zona del navegador. Descartada: el mismo bloqueo se guardaría distinto según el equipo de quien lo cargue.
- *Alternativa:* variable de entorno `STUDIO_TZ`. Descartada por ahora: no hay segundo valor que justifique otra variable por configurar en Vercel; la constante es una línea.

### 3. Capa de datos con la base inyectada
`src/lib/agenda/horarios.ts` y `src/lib/agenda/bloqueos.ts` exponen funciones que reciben la base: `listarHorarios`, `agregarHorario`, `quitarHorario`; `listarBloqueos`, `agregarBloqueo`, `quitarBloqueo`. No conocen Next ni la sesión. Las acciones hacen solo: `await requerirAdmin()` → parsear `FormData` con Zod → llamar con `getDb()` → devolver estado o `refresh()`.
- `agregarHorario` comprueba el solapamiento y inserta dentro de una transacción: lee los tramos de esa maquilladora y día, y rechaza si `inicio_nuevo < fin_existente AND fin_nuevo > inicio_existente` (contiguos permitidos). Devuelve un resultado explícito (`creado` o `solapado`), no una excepción.
- `quitarHorario(db, maquilladoraId, id)` y `quitarBloqueo(db, maquilladoraId, id)` borran con `WHERE id = ? AND maquilladora_id = ?`: un id que pertenezca a otra maquilladora no se borra, y uno inexistente no falla (idempotente, cubre el reenvío).
- `agregarBloqueo` no comprueba nada contra reservas ni horarios: la spec lo permite expresamente.
- *Alternativa:* consultas Drizzle directas en las acciones. Menos archivos, pero obliga a montar Next o a mockear para probar.

### 4. Esquemas Zod
`src/lib/agenda/esquemas.ts`:
- `horarioSchema`: `diaSemana` (texto de un dígito 0–6 → entero), `horaInicio` y `horaFin` (`HH:mm` con 00–23 y 00–59, normalizadas a `HH:mm`), y un `refine` de que el fin es posterior al inicio con el error en el campo `horaFin`.
- `bloqueoSchema`: `inicio` y `fin` (`YYYY-MM-DDTHH:mm`, validadas como fecha real y convertidas con la función de la decisión 2), `motivo` (`trim`, 1–200), y `refine` de fin posterior al inicio con el error en `fin`.
- Los mensajes van en español y por campo, como en #4. El límite de 200 caracteres del motivo es un supuesto razonable que no viene del PRD.

### 5. Estado de formulario y botones de baja
Los formularios de alta reutilizan `EstadoFormulario` y `useActionState` de #4 (errores por campo, valores conservados, botón deshabilitado mientras envía). En éxito la acción no redirige: devuelve el estado limpio y hace `refresh()` para que la lista muestre el cambio, y el formulario se vacía. Las bajas son formularios de un botón con `maquilladoraId` e `id` ocultos que llaman a una acción sin estado; terminan con `refresh()`.
- *Alternativa:* redirigir tras cada alta. Recarga toda la pantalla y descarta el contexto de scroll cuando se cargan varios tramos seguidos (caso típico: cargar la semana entera).

### 6. Presentación
El horario semanal se muestra como siete bloques de día (lunes a domingo; el valor 0 del esquema es domingo y se coloca al final). Los bloqueos se listan en una tabla con `badge` "Pasado" más el texto, sin depender solo del color (ADR 0010). "Pasado" significa `fin <= ahora`, calculado al renderizar. Los inputs usan `type="time"` y `type="datetime-local"` como ayuda; la validación real sigue siendo la del servidor.
- *Alternativa:* grilla visual de la semana. Más trabajo sin que el PRD lo pida; la vista tipo calendario es #14.

### 7. Pruebas
- Unitarias: esquemas (hora `24:00`, `9:5`, fin igual al inicio, día `7`, motivo vacío, motivo de 201 caracteres, fecha `2026-02-30`), conversión de zona (09:00 locales ↔ 14:00 UTC, ida y vuelta, no depende de `TZ` del proceso: se prueba con `TZ` distintos), componentes de formulario.
- Integración con Postgres real (ADR 0011): alta, solapamiento, contiguos, varios tramos el mismo día, baja idempotente, baja con maquilladora equivocada, bloqueo creado y leído con la misma hora local, orden futuros-primero, y que un tramo o bloqueo sobre una maquilladora con reservas no toca las líneas.
- Acciones: con `requerirAdmin` simulado para lanzar `NoAutorizado` no se invoca ninguna función de datos; la prueba de convención de #3 ya recorre el nuevo `actions.ts`.

## Risks / Trade-offs

- **Zona horaria equivocada** → los bloqueos quedarían desplazados varias horas y #6 mostraría horarios incorrectos. Mitigación: constante única, pruebas de ida y vuelta y supuesto marcado como pregunta abierta; confirmar con el studio antes de cargar datos reales.
- **Solapamiento de tramos sin respaldo de la base** → sin restricción en la base, dos altas simultáneas podrían dejar tramos solapados. Mitigado en la aplicación: `agregarHorario` bloquea la fila de la maquilladora (`SELECT … FOR UPDATE`) dentro de la transacción, así que las altas de una misma maquilladora se serializan (hay una prueba de integración con dos altas simultáneas). No exigió migración.
- **Quitar un tramo o agregar un bloqueo no avisa de reservas afectadas** → una reserva que ya existe dentro de un bloqueo nuevo sigue vigente. Aceptado y declarado fuera de alcance; el studio las ve en el panel de reservas (#11) y en la agenda (#14). #6 no debe ofrecer horarios bloqueados, pero tampoco anula reservas previas.
- **Sin edición** → corregir un error exige quitar y volver a cargar. Aceptado por simplicidad; agregar edición después no cambia el modelo.
- **Cálculo de "pasado" al renderizar** → una página abierta mucho tiempo puede mostrar un estado viejo hasta recargar. Sin consecuencias de negocio.
- **Sin login real contra una base** (pendiente de #3 y #4: tareas 5.2) → la comprobación manual de punta a punta depende de que haya `AUTH_SECRET` y una administradora creada en Neon.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega como código. Rollback: revertir el despliegue; los tramos y bloqueos cargados siguen siendo válidos para el esquema existente.

## Open Questions

- ¿El studio opera en hora de Lima (`America/Lima`)? Cambia solo `ZONA_STUDIO`, pero hay que confirmarlo antes de cargar bloqueos reales.
- ¿Conviene advertir al guardar un bloqueo que cubre reservas ya existentes? Hoy no se advierte (fuera de alcance); puede ser una mejora cuando exista el panel de reservas (#11).
