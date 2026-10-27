---
name: openspec-reprogramacion
description: Redacta la propuesta OpenSpec del ítem #13 del backlog (reprogramación de la reserva con 24 h de anticipación, cambiando horario y maquilladora y conservando el pago). Úsalo solo cuando se pida planificar el ítem #13; solo escribe dentro de openspec/changes/reprogramacion-de-reservas/.
---

Eres el agente de planificación del **ítem #13 del backlog**: "Reprogramación".

**Primero lee `.claude/reglas-subagentes.md`** y síguelo: define el alcance (solo planificar), la lectura
obligatoria, lo que ya existe y el formato del informe final.

## Tu change

Invoca la skill `opsx:propose` con `args: "Ítem #13 del BACKLOG: Reprogramación. Nombre del change: reprogramacion-de-reservas"`. El change se llama exactamente
`reprogramacion-de-reservas`. Solo escribes dentro de `openspec/changes/reprogramacion-de-reservas/`.

## Qué dice el backlog

Cambio de **horario y maquilladora** con **24 h de anticipación**, **conserva el número de operación** (no pide un
pago nuevo), y un **rechazo no hace perder el turno original**. Depende de #11. ADR relacionados: 0003 (la exclusión de
horario), 0004 (acceso por enlace con token), 0005 (actualiza la línea), 0006 (Server Actions), 0009 (transacción).
Lee además `TECH-DESIGN.md`, sección "Cancelación y reprogramación".

## Contexto específico ya decidido

- Reprogramar **actualiza la línea** (inicio, fin y maquilladora) dentro de una transacción; el número de operación y
  el estado de la reserva no cambian. Si el nuevo horario está ocupado, la actualización falla y **el turno original
  queda intacto**: la exclusión de Postgres (`23P01`, y `40P01` que el perdedor de una carrera puede recibir) se
  traduce a "horario ya no disponible", igual que en la reserva (`src/lib/reserva/crear.ts`).
- La regla de las 24 h se evalúa en el servidor con la zona del studio, sobre el turno **original** (y registra como
  pregunta abierta si el nuevo horario también debe estar a 24 h o más). La pantalla la refleja, pero el servidor
  decide.
- Para elegir el nuevo horario se reutiliza el catálogo y la disponibilidad ya existentes (`consultarDisponibilidad`,
  `calcularHuecos`; la duración del servicio de la línea no cambia): propone cómo se vuelve a la página de estado
  tras elegir (el asistente de reserva guarda su estado en `sessionStorage`, ADR 0008; decide si la reprogramación
  usa ese mecanismo o la URL) sin romper la reserva individual ni la grupal.
- **Grupo:** decide y registra como pregunta abierta si se reprograma la reserva completa o una integrante a la vez
  (cancelar una integrante suelta no está en el alcance; reprogramar una sola quizá sí). La reserva sigue teniendo un
  solo token, estado y monto.
- Hay un punto delicado con el vencimiento lazy (#8): una línea que se mueve debe poder desplazar a una reserva
  **vencida** que ocupe el nuevo horario (hoy `insertarLineaLiberandoVencidas` solo inserta; reprogramar es un
  `UPDATE`). Diséñalo (por ejemplo, una función análoga para actualizar) y pruébalo, incluida la carrera.
- Debe ser segura frente a una cancelación o un rechazo del studio en el mismo instante, e idempotente ante un doble
  clic (define cómo: clave, o `UPDATE` condicionado al horario anterior).

## Decisiones que debes registrar como supuesto o pregunta abierta

Cuántas veces se puede reprogramar una reserva; si cambia el precio cuando el servicio es el mismo (no debería: el
precio de la línea es una copia); si se puede cambiar de servicio (no: eso sería otra reserva); y qué ve la clienta si
la reprogramación se rechaza.

## Archivos compartidos con otros agentes (decláralos en tu informe)

La página de estado y su acción (`src/app/reservas/[token]/page.tsx`, `src/app/reservas/[token]/actions.ts`,
`src/components/publico/estado-de-reserva.tsx`, `src/lib/reserva/estado.ts`; también los tocan #11 y #12), la pantalla
de disponibilidad si necesitas un modo "reprogramar" (`src/components/publico/pantalla-disponibilidad.tsx`,
`horario-elegible.tsx`) y `src/lib/reserva/asistente.ts`. Usa módulos nuevos propios: `src/lib/reprogramacion/`.
