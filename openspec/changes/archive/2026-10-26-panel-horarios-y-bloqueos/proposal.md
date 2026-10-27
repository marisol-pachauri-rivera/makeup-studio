# Proposal

## Why

Sin horarios de trabajo cargados no existe ningún horario libre que ofrecer, y sin bloqueos el studio no puede reflejar ausencias ni cierres. El catálogo público y la disponibilidad (#6) dependen de estos dos datos, y hoy solo pueden cargarse tocando la base a mano. Las maquilladoras ya se administran desde el panel (#4), así que el studio puede cargar su agenda por sí mismo.

## What Changes

- Pantalla `/admin/maquilladoras/[id]/agenda` del panel, una por maquilladora, con dos bloques: horario semanal y bloqueos.
- **Horario semanal:** ver los tramos cargados por día de la semana, agregar un tramo (día, hora de inicio, hora de fin) y quitarlo. Un día puede tener más de un tramo (por ejemplo, mañana y tarde), siempre que no se solapen entre sí.
- **Bloqueos de agenda:** ver los bloqueos de la maquilladora, agregar uno (fecha y hora de inicio, fecha y hora de fin, motivo) y quitarlo. Los futuros se muestran primero y los pasados quedan identificados.
- Server Actions de escritura con `requerirAdmin()` como primera línea y entradas validadas con Zod en el servidor (ADR 0006), con mensajes en español por campo.
- Acceso a la agenda desde el listado y la edición de maquilladoras.
- Las fechas y horas se ingresan y se muestran en la hora local del studio (zona `America/Lima`, supuesto a confirmar).
- Quitar un tramo o un bloqueo es un borrado real: ninguna reserva referencia estas filas, así que no hay historial que conservar.

Fuera de alcance: calcular o mostrar disponibilidad pública (#6), la agenda por día con reservas (#14), editar un tramo o un bloqueo ya cargado (se quita y se vuelve a cargar), bloqueos recurrentes, advertir o cancelar reservas que ya existan dentro de un bloqueo nuevo o fuera de un horario recién quitado (las gestiona el panel de reservas, #11), y cualquier cambio de esquema o migración.

## Capabilities

### New Capabilities
- `work-schedule-management`: carga, consulta y baja de los tramos del horario semanal de una maquilladora desde el panel, con validación del servidor y sin solapamientos dentro de un mismo día.
- `agenda-block-management`: carga, consulta y baja de bloqueos de agenda de una maquilladora desde el panel, con validación del servidor y hora local del studio.

### Modified Capabilities
<!-- Ninguna: las restricciones de `studio-reference-data` (día de 0 a 6, fin posterior al inicio) ya existen y no cambian. -->

## Impact

- Código nuevo: `src/app/admin/(panel)/maquilladoras/[id]/agenda/**` (página, formularios y `actions.ts`), lógica de datos y esquemas Zod en `src/lib/agenda/`.
- Código tocado: listado y edición de maquilladoras (enlace a la agenda).
- Base de datos: sin cambios de esquema ni migraciones; usa `horario_trabajo` y `bloqueo_agenda` tal como están.
- Dependencias: ninguna nueva. Componentes de shadcn/ui ya presentes (`table`, `badge`); si falta alguno se agrega con el CLI (ADR 0010).
- Pruebas: unitarias de esquemas y conversión de zona horaria, de formularios, de integración con Postgres real (ADR 0011); la prueba de convención de #3 cubre automáticamente el nuevo `actions.ts`.
