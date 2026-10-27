## ADDED Requirements

### Requirement: Clave de idempotencia opcional y única
La reserva SHALL poder guardar una clave de idempotencia que identifica el intento de reserva que la creó. La clave MUST ser única entre reservas cuando existe, y varias reservas sin clave MUST poder coexistir.

#### Scenario: Reserva con clave
- **WHEN** se inserta una reserva con una clave de idempotencia
- **THEN** la reserva queda guardada con esa clave

#### Scenario: Clave repetida
- **WHEN** se intenta insertar una segunda reserva con una clave que ya usa otra
- **THEN** la base rechaza la inserción

#### Scenario: Reservas sin clave
- **WHEN** se insertan dos reservas sin clave de idempotencia
- **THEN** la base acepta ambas
