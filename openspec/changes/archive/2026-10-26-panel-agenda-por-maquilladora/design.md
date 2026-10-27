# Design

## Context

Estado de partida (#1 a #10): `horario_trabajo`, `bloqueo_agenda`, `reserva` y `reserva_linea` existen; `reserva_linea` tiene la exclusión GiST `reserva_linea_sin_solapamiento` (por maquilladora y rango semiabierto), que también sirve de índice para consultas por rango. `listarHorarios` (`src/lib/agenda/horarios.ts`) lee los tramos de una maquilladora; `ZONA_STUDIO`, `aPartesLocales` y `deLocalAInstante` (`src/lib/agenda/zona-horaria.ts`) y `hoyLocal`, `sumarDias`, `diaDeLaSemana` (`src/lib/disponibilidad/fechas.ts`) convierten entre hora de Lima y `timestamptz`; `leerParametros` (`src/lib/disponibilidad/parametros.ts`) ya valida `fecha` sin lanzar; `condicionVencida` (`src/lib/reserva/vencimiento.ts`) es la única definición de reserva vencida. El panel lee la sesión con `requerirAdminOLogin()` dentro de `<Suspense>`. El menú vive en `src/components/panel/navegacion.tsx` (`SECCIONES_DEL_PANEL`, que alimenta cabecera e inicio), no en `layout.tsx`.

Restricciones: ADR 0006 (lecturas en Server Components, sin endpoints, sin acciones aquí), ADR 0005 (`activa` ocupa agenda), ADR 0010 (shadcn/ui sin calendario, mobile-first), Next 16 con `cacheComponents` (el reloj `new Date()` solo se lee tras una API de petición), servidor en UTC.

## Goals / Non-Goals

**Goals:**
- Ver un día completo por maquilladora, con el mismo criterio de "vencida" que la disponibilidad pública.
- Lógica de armado como funciones puras y consulta con la base inyectada, probadas sin Next.

**Non-Goals:**
- Escribir datos, vista en grilla por horas, filtro por maquilladora, conteos por día, enlazar a un detalle de reserva (depende de #11).

## Decisions

### 1. Composición a mano, sin librería (opción por defecto, decisión abierta)
La vista se arma con `table`, `badge` y `button` ya presentes. No agrega dependencias, mantiene el free tier simple y el bundle pequeño. **No se resuelve en silencio la alternativa de una librería:** ver Open Questions, con costos. Si la persona responsable elige librería, hace falta un ADR nuevo o actualizado y este diseño cambia en la presentación, no en `src/lib/agenda-panel/`.

### 2. Una pantalla `/admin/agenda`, un día, todas las maquilladoras
`src/app/admin/(panel)/agenda/page.tsx`: sesión, luego `searchParams`, luego `new Date()`, todo dentro de `<Suspense>`. Una sección por maquilladora (apiladas, sin columnas, para que el celular no necesite scroll horizontal). Dentro de cada sección, el horario del día ("Trabaja 09:00 a 13:00 y 15:00 a 19:00" o "No trabaja este día") y una tabla cronológica que mezcla turnos y bloqueos (columna Hora, Detalle, Estado; el bloqueo lleva la etiqueta de texto "Bloqueo" y su motivo). Se muestran las maquilladoras activas y las inactivas con turnos ese día (no se oculta una reserva viva por haber desactivado a la persona). Cada sección enlaza a `/admin/maquilladoras/<id>/agenda` (horario y bloqueos, #5) con el texto "Horario y bloqueos", para no confundirse con esta pantalla.
- *Alternativa:* columnas por maquilladora en una grilla. Mejor en escritorio, ilegible en celular con varias maquilladoras; descartada por ADR 0010 mobile-first.

### 3. Rango por defecto: hoy; semana como navegación
El rango es un día (hoy en `ZONA_STUDIO`). La semana (lunes a domingo de la fecha mostrada) es solo una franja de siete enlaces `?fecha=`, con "Anterior", "Siguiente", "Hoy" y un `<form method="get">` con `<input type="date" name="fecha">`, que funciona sin JavaScript. La fecha se lee con `leerParametros({ fecha })` (Zod, ya tolerante: inválida, inexistente o repetida equivale a hoy). Se admiten fechas pasadas para consultar historial.
- *Alternativa:* mostrar toda la semana a la vez. Más datos por pantalla sin que el PRD lo pida; queda como mejora.

### 4. Consulta: `obtenerAgendaDelDia(db, fecha, ahora)`
En `src/lib/agenda-panel/consulta.ts`. Límites del día: `deLocalAInstante("<fecha>T00:00")` y el de `sumarDias(fecha, 1)` (con el mismo respaldo que `finDeVentana`). Se ejecutan en paralelo, fuera de transacción (solo lecturas): maquilladoras; `listarHorarios` por maquilladora filtrado luego por `diaDeLaSemana(fecha)` (pocas filas); bloqueos con `fin > inicioDia AND inicio < finDia`; y líneas con `activa = true AND fin > inicioDia AND inicio < finDia` unidas a `reserva`, `servicio`. Cada línea trae `vencida` calculada con `sql<boolean>\`${condicionVencida(ahora)}\`` (igual que `liberarVencidasEnConflicto`), así la agenda y la disponibilidad nunca discrepan. `listarBloqueos` no se reutiliza porque no filtra por rango y devuelve todo el historial. Un turno que cruza la medianoche aparece en ambos días.
- *Alternativa:* una consulta por maquilladora. N consultas por pantalla sin ventaja.

### 5. Armado puro
`src/lib/agenda-panel/armar-dia.ts` (`armarDia`) agrupa por maquilladora, ordena por inicio, fusiona turnos y bloqueos en una línea de tiempo, descarta las inactivas sin turnos, y calcula la etiqueta de estado por función pura: `pendiente_pago` → "Pendiente de pago" (más "Plazo vencido" si `vencida`; "Pago rechazado" si tiene `motivoRechazo`), `pendiente_validacion` → "Pendiente de validación", `confirmada` → "Confirmada". Las horas se dan con `aPartesLocales`. Las líneas canceladas no llegan (filtro `activa`).

### 6. Reserva vencida: visible y marcada
Se sigue mostrando, con "Plazo vencido" como texto en un `badge` de contorno, porque seguirá figurando en la base hasta que otra clienta tome el horario, y la administradora debe poder cancelarla o llamar. Se evita ocultarla para no esconder dinero potencialmente pagado.

### 7. Contacto visible (supuesto)
La vista es solo para la administradora con sesión, así que muestra nombre de contacto (solo si difiere de la persona) y teléfono como texto, para poder llamar sin abrir otra pantalla. Es un supuesto del diseño, no del PRD: ver Open Questions. No hay datos nuevos y no se registran en logs.

### 8. Navegación del panel
Se agrega `{ href: "/admin/agenda", etiqueta: "Agenda", descripcion: "Turnos del día por maquilladora." }` a `SECCIONES_DEL_PANEL` en `navegacion.tsx`, y la prueba existente cubre el enlace. Archivo compartido con #11: el cambio es una línea y las dos adiciones se combinan sin conflicto lógico. El botón "Agenda" del listado de maquilladoras (#5) no se renombra; queda anotada la ambigüedad.

### 9. Pruebas
- Unitarias: límites del día y borde de Lima, franja de semana (lunes a domingo, cruce de mes), `armarDia` (orden, mezcla con bloqueos, etiquetas, inactiva sin turnos, día sin horario), componentes (estado escrito, "Plazo vencido", "No trabaja este día", estado vacío), y que bajo `src/app/admin/(panel)/agenda/` no exista `actions.ts` ni `"use server"`.
- Integración con Postgres real (ADR 0011, limpiar en `beforeEach`): solo activas; cancelada excluida; borde de día en Lima (23:30 Lima = 04:30 UTC del día siguiente cuenta en su día; 00:00 del siguiente día no); turno y bloqueo que cruzan la medianoche; vencida marcada y coherente con `consultarDisponibilidad` (el mismo turno figura libre allí); rechazo sin marca; grupal con tres líneas; dos maquilladoras separadas; inactiva con y sin turnos. Carrera aplicable: una lectura mientras otra transacción tiene un alta sin confirmar no la ve y no queda bloqueada (la agenda es una lectura de una instantánea).

## Risks / Trade-offs

- **Zona horaria `America/Lima`** sigue siendo un supuesto de #5; un error desplazaría los días mostrados. Misma constante, sin nuevo riesgo.
- **Sin acciones, la administradora no puede cancelar desde aquí** → deriva a #11. Se acepta.
- **Datos personales en pantalla** (teléfono) → solo con sesión y sin caché compartida (ya garantizado por `admin-access-control`).
- **Reloj de la página** → una pestaña abierta días muestra "hoy" viejo hasta recargar. Sin consecuencias de negocio.

## Migration Plan

Sin migraciones ni variables. Se despliega como código; rollback: revertir el despliegue.

## Open Questions

- **DECISIÓN ABIERTA (ADR 0010): ¿calendario compuesto a mano o con librería?** Este diseño propone a mano. Alternativa: una librería de calendario o agenda (por ejemplo FullCalendar o una grilla tipo Schedule-X). Costos: dependencia nueva y su mantenimiento, peso extra de bundle en cliente (la vista pasaría de Server Component puro a componente de cliente), accesibilidad y teclado que dependen de la librería, estilos que chocan con Tailwind y shadcn/ui (hay que sobreescribir sus temas), y contradice la restricción de simplicidad del free tier; adoptarla exige consultar y un ADR nuevo. Beneficio: grilla por horas y arrastre listos. Debe decidirlo la persona responsable.
- ¿Se muestra el teléfono de contacto? Se asume que sí (supuesto, solo administradora).
- ¿La reserva vencida debe verse siempre o con filtro? Se asume siempre, con marca.
- ¿Renombrar el botón "Agenda" de maquilladoras (#5) a "Horario y bloqueos" para evitar confusión con esta pantalla? No se hace aquí.
- ¿Conviene mostrar conteos de turnos por día en la franja de la semana? Se deja fuera.
