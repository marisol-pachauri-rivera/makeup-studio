---
name: openspec-panel-reservas
description: Redacta la propuesta OpenSpec del ítem #11 del backlog (panel de reservas: lista, validar pago, rechazar con motivo y cancelación manual). Úsalo solo cuando se pida planificar el ítem #11; solo escribe dentro de openspec/changes/panel-reservas-validacion-y-rechazo/.
---

Eres el agente de planificación del **ítem #11 del backlog**: "Panel: reservas, validación y rechazo".

**Primero lee `.claude/reglas-subagentes.md`** y síguelo: define el alcance (solo planificar), la lectura
obligatoria, lo que ya existe y el formato del informe final.

## Tu change

Invoca la skill `opsx:propose` con `args: "Ítem #11 del BACKLOG: Panel de reservas, validación y rechazo. Nombre del change: panel-reservas-validacion-y-rechazo"`. El change se llama exactamente
`panel-reservas-validacion-y-rechazo`. Solo escribes dentro de `openspec/changes/panel-reservas-validacion-y-rechazo/`.

## Qué dice el backlog

Lista de reservas, **validar**, **rechazar con motivo** (vuelve a `pendiente_pago`, libera el número), cancelación
manual. La página de estado refleja el estado y el motivo. Sin plazo máximo de validación. Depende de #3 (sesión
admin) y #10 (pago). ADR relacionados: 0003 (el rechazo no vence), 0004 (sin plazo de validación), 0005 (rechazo de
pago), 0006 (Server Actions), 0007 (sesión admin). Lee además `TECH-DESIGN.md`, secciones "Pago y validación" y
"Panel administrativo y agenda".

## Contexto específico ya decidido

- Validar: `pendiente_validacion` → `confirmada` (guarda `validada_en`). Rechazar: `pendiente_validacion` →
  `pendiente_pago` en **una sola operación**: el número se pone en nulo (queda libre bajo el `UNIQUE`), se guarda el
  motivo de rechazo (obligatorio) y las líneas siguen activas (el horario se conserva). Una reserva devuelta por un
  rechazo no vence (`condicionVencida` ya lo respeta). Cancelar desde el panel: cualquier estado → `cancelada` con
  motivo `studio` y líneas inactivas (el horario se libera).
- Cada acción verifica sesión primero (`requerirAdmin()`), valida con Zod y es un `UPDATE` condicionado al estado
  esperado, para ser segura frente a una clienta que justo ingresa o corrige su número (#10) o a un vencimiento (#8).
- La página de estado (`obtenerReservaPorToken`, `EstadoDeReservaVista`) hoy **no devuelve** el motivo del rechazo a
  propósito (se dejó para este ítem): ahora debe mostrarlo junto al formulario del número, y el ingreso de #10 ya
  acepta un número nuevo y limpia el motivo.
- Marcar el reembolso como `realizado` es del ítem #12, no tuyo; pero tu lista de reservas debe poder mostrar el
  estado de reembolso para que #12 lo use.

## Decisiones que debes registrar como supuesto o pregunta abierta

Qué filtros y qué orden tiene la lista (por defecto: pendientes de validación primero, más antiguas arriba); cuántas
filas por página; si cancelar una reserva `confirmada` desde el panel deja el reembolso en `pendiente` (el
`TECH-DESIGN.md` solo lo dice para la cancelación de la clienta); qué ve la administradora del contacto (teléfono)
y cómo; y si hace falta una confirmación antes de rechazar o cancelar.

## Archivos compartidos con otros agentes (decláralos en tu informe)

El menú del panel (`src/components/panel/navegacion.tsx` (`SECCIONES_DEL_PANEL`, con su prueba `navegacion.test.tsx`), también lo toca #14) y la página de estado
(`src/app/reservas/[token]/page.tsx`, `src/components/publico/estado-de-reserva.tsx`, `src/lib/reserva/estado.ts`;
también los tocan #12 y #13). Usa módulos nuevos propios: `src/lib/reservas-panel/` y
`src/app/admin/(panel)/reservas/`.
