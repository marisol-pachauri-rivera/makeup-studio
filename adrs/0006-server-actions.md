# ADR 0006: Server Actions y Server Components como contrato cliente-servidor

## Estado

Aceptado

## Contexto

El sistema es un monolito Next.js (ADR 0001) cuyo único consumidor es su propio frontend: sitio
público (catálogo, disponibilidad, reserva, página de estado) y panel admin (validar pagos,
gestionar agenda y reservas). El PRD no prevé app móvil ni integraciones externas que consuman
una API. El equipo es de una persona.

## Decisión

Las lecturas se resuelven en el servidor con Server Components, consultando la base de datos con
Drizzle (ADR 0002). Las escrituras (crear reserva, ingresar número de operación, cancelar,
reprogramar, validar pago, gestionar agenda) son Server Actions. Toda entrada se valida con Zod
en el servidor antes de tocar la base, y toda acción del panel verifica la sesión admin. No se
definen endpoints REST propios.

## Alternativas consideradas

- **API REST con route handlers y validación con Zod** — contrato explícito y reutilizable por
  otros clientes, pero más código de pegamento (endpoints, fetch, tipos) sin un consumidor
  externo que lo justifique hoy.
- **tRPC** — tipos de punta a punta, pero agrega una capa y dependencia que Server Actions ya
  cubre en Next.js.

## Consecuencias

- Menos código y tipos compartidos entre cliente y servidor, sin mantener endpoints.
- El contrato queda acoplado a Next.js y no es una API pública: si más adelante aparece una app
  móvil o una integración, habrá que exponer una API aparte.
- Cada Server Action es un punto de entrada público en la práctica, por lo que la validación con
  Zod y la verificación de autorización deben repetirse en cada una; olvidarla en una acción
  del panel sería una brecha de seguridad.
