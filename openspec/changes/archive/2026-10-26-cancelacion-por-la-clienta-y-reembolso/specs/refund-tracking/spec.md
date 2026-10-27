## Purpose

Que el studio sepa qué reembolsos debe hacer y deje constancia de los que ya hizo, y que la clienta vea en qué punto está el suyo.

## ADDED Requirements

### Requirement: Estado de reembolso al cancelar la clienta
Al cancelar la clienta, el sistema SHALL fijar el estado de reembolso según el estado previo: `confirmada` queda `pendiente`; `pendiente_pago` queda `no_aplica`. El caso `pendiente_validacion` queda `pendiente` como supuesto a confirmar con el studio. Una cancelación por vencimiento MUST seguir en `no_aplica`.

#### Scenario: Pago validado
- **WHEN** se cancela una reserva confirmada
- **THEN** el reembolso queda `pendiente`

#### Scenario: Sin pago informado
- **WHEN** se cancela una reserva en `pendiente_pago`
- **THEN** el reembolso queda `no_aplica`

#### Scenario: Pago informado sin validar
- **WHEN** se cancela una reserva en `pendiente_validacion`
- **THEN** el reembolso queda `pendiente` (supuesto, ver design)

#### Scenario: Vencimiento
- **WHEN** una reserva se cancela por vencimiento
- **THEN** su reembolso sigue en `no_aplica`

### Requirement: Lista de reembolsos pendientes en el panel
El panel SHALL ofrecer a la administradora autenticada una lista de las reservas con reembolso `pendiente`, con monto, número de operación, nombre y teléfono de contacto, de la más antigua a la más reciente. Sin sesión MUST redirigir al login.

#### Scenario: Hay pendientes
- **WHEN** la administradora abre la lista con dos reembolsos pendientes
- **THEN** ve ambos con su monto y número de operación

#### Scenario: Sin pendientes
- **WHEN** no hay reembolsos pendientes
- **THEN** la lista dice que no hay reembolsos por hacer

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión abre la lista
- **THEN** es llevado al login

### Requirement: Marcar un reembolso como realizado
El panel SHALL permitir marcar `realizado` un reembolso `pendiente`, solo con sesión válida. Marcarlo MUST ser idempotente y no puede aplicarse a una reserva cuyo reembolso sea `no_aplica`.

#### Scenario: Marcar realizado
- **WHEN** la administradora marca un reembolso pendiente
- **THEN** pasa a `realizado` y sale de la lista de pendientes

#### Scenario: Repetido
- **WHEN** se marca dos veces el mismo reembolso
- **THEN** sigue `realizado` sin error

#### Scenario: No aplica
- **WHEN** se intenta marcar una reserva con reembolso `no_aplica`
- **THEN** la acción lo rechaza y no cambia nada

#### Scenario: Sin sesión
- **WHEN** se invoca la acción sin sesión válida
- **THEN** falla y no cambia nada
