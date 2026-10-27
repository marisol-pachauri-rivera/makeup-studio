---
name: openspec-cancelacion-clienta
description: Redacta la propuesta OpenSpec del ítem #12 del backlog (cancelación por la clienta con 24 h de anticipación y gestión del reembolso). Úsalo solo cuando se pida planificar el ítem #12; solo escribe dentro de openspec/changes/cancelacion-por-la-clienta-y-reembolso/.
---

Eres el agente de planificación del **ítem #12 del backlog**: "Cancelación por la clienta y reembolso".

**Primero lee `.claude/reglas-subagentes.md`** y síguelo: define el alcance (solo planificar), la lectura
obligatoria, lo que ya existe y el formato del informe final.

## Tu change

Invoca la skill `opsx:propose` con `args: "Ítem #12 del BACKLOG: Cancelación por la clienta y reembolso. Nombre del change: cancelacion-por-la-clienta-y-reembolso"`. El change se llama exactamente
`cancelacion-por-la-clienta-y-reembolso`. Solo escribes dentro de `openspec/changes/cancelacion-por-la-clienta-y-reembolso/`.

## Qué dice el backlog

Cancelar desde el enlace con **24 h de anticipación** (en el cliente y en el servidor), reembolso `pendiente`, y el
panel lo marca `realizado`. Depende de #11. ADR relacionados: 0004 (acceso por enlace con token; quien tenga el enlace
puede cancelar), 0005 (estado de reembolso y precio por línea), 0006 (Server Actions). Lee además `TECH-DESIGN.md`,
sección "Cancelación y reprogramación", y el PRD (alcance: cancelación y reprogramación con mínimo de 24 horas).

## Contexto específico ya decidido

- Cancelar es **de la reserva completa** (también en un grupo; cancelar a una integrante suelta no está en el
  alcance). La reserva pasa a `cancelada` con motivo `clienta`, sus líneas quedan inactivas (el horario se libera) y
  el reembolso se decide por el estado: con pago validado (`confirmada`) queda `pendiente`. Registra como supuesto
  qué pasa en `pendiente_pago` (sin pago: `no_aplica`) y en `pendiente_validacion` (la clienta informó un pago que el
  studio aún no validó: ¿reembolso `pendiente`?). Es una pregunta abierta, no la des por resuelta.
- La regla de las 24 h se evalúa en el servidor con la zona del studio (`America/Lima`) y con el **primer turno** de la
  reserva; en la pantalla el botón se deshabilita pasado el plazo, pero el servidor es quien decide. Define cómo se
  muestra el plazo y qué dice la página pasadas las 24 h (por ejemplo, que escriba al studio).
- La cancelación es un `UPDATE` condicionado al estado esperado y a la regla de las 24 h, en una transacción con las
  líneas (`activa = false`). Debe ser idempotente (doble clic) y segura frente a una validación o un rechazo del
  studio en el mismo instante (#11).
- Marcar el reembolso como `realizado` es una acción del panel (`requerirAdmin()`); la lista de reservas la construye
  #11 y muestra el estado de reembolso: tú agregas la acción y el filtro de "reembolsos pendientes", sin reescribir la
  lista. Una reserva cancelada por vencimiento no genera reembolso (no hubo pago informado).
- El enlace es la única credencial (ADR 0004): `/reservas/[token]` ya no se indexa ni se cachea.

## Decisiones que debes registrar como supuesto o pregunta abierta

Si hace falta confirmación antes de cancelar; qué texto ve la clienta sobre el reembolso (monto, quién lo gestiona y
cuándo, sin prometer plazos que el sistema no controla); si se pide un motivo; y qué hace el panel si un reembolso
`pendiente` pertenece a una reserva sin número de operación.

## Archivos compartidos con otros agentes (decláralos en tu informe)

La página de estado y su acción (`src/app/reservas/[token]/page.tsx`, `src/app/reservas/[token]/actions.ts`,
`src/components/publico/estado-de-reserva.tsx`, `src/lib/reserva/estado.ts`; también los tocan #11 y #13) y la lista
del panel de #11. Usa módulos nuevos propios: `src/lib/cancelacion/`.
