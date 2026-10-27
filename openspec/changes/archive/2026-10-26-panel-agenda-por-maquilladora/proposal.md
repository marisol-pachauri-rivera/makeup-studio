# Proposal

## Why

El studio ya carga horarios y bloqueos (#5) y las clientas ya reservan (#7), pero la administradora no tiene dónde ver, de un vistazo, qué turnos tiene cada maquilladora un día dado. Para saber quién atiende a quién y a qué hora debe ir a la base o escribirle a las maquilladoras. El criterio de aceptación de TECH-DESIGN lo pide: "El panel muestra la agenda por maquilladora con las reservas activas por día".

## What Changes

- Nueva pantalla `/admin/agenda` del panel, de **solo lectura**, que muestra un día a la vez (por defecto hoy, hora de Lima) con una sección por maquilladora.
- Cada sección muestra el horario de trabajo de ese día, los bloqueos que lo tocan y los turnos activos (persona, servicio, inicio y fin en hora de Lima, estado de la reserva y contacto), ordenados por hora.
- Una reserva en `pendiente_pago` ya vencida (aún sin cancelar) sigue apareciendo, marcada con el texto "Plazo vencido" (no solo color), porque la disponibilidad pública ya la ofrece como libre.
- Navegación entre días con la fecha en la URL (`?fecha=YYYY-MM-DD`, validada con Zod y tolerante a valores inválidos), franja de la semana, "Hoy" y un selector de fecha que funciona sin JavaScript.
- Acceso desde el menú y la página de inicio del panel.
- Se compone **a mano con los componentes de shadcn/ui ya presentes** (`table`, `badge`, `button`), sin dependencias nuevas. La alternativa de una librería de calendario queda como pregunta abierta (ADR 0010), sin resolver aquí.

Fuera de alcance: escribir (crear, mover, cancelar o validar reservas; eso es #11, #12 y #13), vista de calendario en grilla por horas, filtro por maquilladora, conteos por día, migraciones y cualquier dependencia nueva.

## Capabilities

### New Capabilities
- `admin-daily-agenda`: vista de solo lectura del panel con, por día y maquilladora, horario de trabajo, bloqueos y turnos activos con su estado, en hora local del studio.

### Modified Capabilities
<!-- Ninguna: las rutas bajo /admin ya exigen sesión (admin-access-control) y la disponibilidad pública no cambia. -->

## Impact

- Código nuevo: `src/lib/agenda-panel/**` (consulta del día, armado de la vista, rango y semana) y `src/app/admin/(panel)/agenda/**` (página y componentes). Sin `actions.ts`.
- Código tocado: `src/components/panel/navegacion.tsx` y su prueba (nueva sección; archivo compartido con #11) y una línea en `README.md`.
- Base de datos: sin cambios de esquema ni migraciones; la exclusión GiST existente sirve las consultas por rango.
- Dependencias: ninguna.
- Pruebas: unitarias de rango, semana, armado y componentes; de integración con Postgres real (ADR 0011).
