# admin-booking-list Specification

## Purpose

Darle al studio una lista de las reservas y un detalle de cada una, con lo necesario para cotejar el pago (número, monto, contacto) y para actuar sobre ellas, sin salir del panel.

## ADDED Requirements

### Requirement: Lista de reservas protegida
El panel SHALL ofrecer `/admin/reservas` con las reservas del studio, solo a quien tenga sesión de administradora. Sin sesión MUST redirigir al inicio de sesión. Cada fila MUST mostrar estado, nombre y teléfono de contacto, número de operación (si existe), monto total, primer turno en hora de Lima, cantidad de personas y estado de reembolso.

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión abre `/admin/reservas`
- **THEN** es llevado al inicio de sesión y no ve ninguna reserva

#### Scenario: Datos de una fila
- **WHEN** hay una reserva en validación de 550.60 con número "OP-123" y contacto "Ana" con su teléfono
- **THEN** la fila muestra el estado, "Ana", el teléfono, "OP-123", 550.60, el primer turno y su cantidad de personas

#### Scenario: Sin reservas
- **WHEN** no existe ninguna reserva
- **THEN** la página lo dice con un texto claro

### Requirement: Orden de la lista
La lista SHALL mostrar primero las reservas en `pendiente_validacion`, de la más antigua a la más reciente por fecha de creación, y después las demás de la más reciente a la más antigua. A igual fecha el orden MUST ser estable por identificador.

#### Scenario: Pendientes primero
- **WHEN** existen una reserva confirmada reciente y una en validación antigua
- **THEN** la reserva en validación aparece arriba

#### Scenario: Más antigua arriba
- **WHEN** hay dos reservas en validación creadas a distinta hora
- **THEN** la creada antes aparece primero

### Requirement: Paginación y filtro por estado
La lista SHALL mostrarse de 25 en 25 con enlaces a la página anterior y siguiente, y permitir filtrar por un estado. Un número de página o un estado inválidos en la dirección MUST caer a la primera página y a "todas" sin error.

#### Scenario: Más de una página
- **WHEN** existen 30 reservas
- **THEN** la primera página muestra 25 y ofrece ir a la siguiente con las 5 restantes

#### Scenario: Filtro por estado
- **WHEN** se filtra por "confirmada"
- **THEN** solo se listan reservas confirmadas

#### Scenario: Parámetros inválidos
- **WHEN** la dirección trae `pagina=abc` y `estado=xyz`
- **THEN** se muestra la primera página sin filtro

### Requirement: Marcas de una pendiente de pago
Una reserva en `pendiente_pago` SHALL indicar si fue devuelta por un rechazo ("esperando nuevo número") o si su plazo de 20 minutos ya pasó sin pago ("plazo vencido"). La lista MUST NOT cancelar reservas al mostrarlas.

#### Scenario: Devuelta por rechazo
- **WHEN** una reserva en pendiente de pago tiene motivo de rechazo
- **THEN** la fila indica que espera un nuevo número

#### Scenario: Plazo vencido
- **WHEN** una reserva sin número, sin rechazo y creada hace 30 minutos sigue en pendiente de pago
- **THEN** la fila indica plazo vencido y su estado no cambia

### Requirement: Detalle de la reserva
`/admin/reservas/<id>` SHALL mostrar el estado, los datos de contacto, el número de operación, el motivo de rechazo o de cancelación si hay, el monto, el reembolso y cada turno con persona, servicio, maquilladora, día y hora de Lima, y ofrecer solo las acciones que el estado permite. Un identificador inexistente o inválido MUST responder "no encontrado".

#### Scenario: Acciones según el estado
- **WHEN** la reserva está en validación
- **THEN** ofrece validar, rechazar y cancelar; y si está cancelada no ofrece ninguna

#### Scenario: Identificador inválido
- **WHEN** se abre `/admin/reservas/abc` o un identificador que no existe
- **THEN** responde "no encontrado"

#### Scenario: Reserva grupal
- **WHEN** la reserva tiene tres integrantes
- **THEN** el detalle lista los tres turnos ordenados por hora de inicio
