# Proposal

## Why

El PRD pide que la clienta complete todo el flujo "individual o grupal" sin escribirle al studio (por ejemplo, un elenco de danza que se maquilla junto). Hoy el asistente solo reserva una persona: para un grupo habría que repetir el flujo N veces, con N tokens, N pagos y N estados que el studio tendría que cruzar a mano. Este ítem (#9) extiende la reserva individual (#7) a una reserva con N líneas, una por integrante, con un solo token, un solo estado de pago y un monto total (ADR 0005), que se guarda completa o no se guarda.

## What Changes

- **Reserva grupal en el servidor:** una nueva función `crearReservaGrupal` crea en **una sola transacción** una `reserva` `pendiente_pago` y **N `reserva_linea` activas** (una por integrante, con su propio nombre, servicio, maquilladora y horario). El monto total es la suma de los precios de las líneas copiados al reservar. El contacto (nombre y teléfono) sigue siendo el de quien reserva. Todo o nada: si una línea choca, no se guarda ninguna.
- **Revalidación de todas las líneas** con la disponibilidad real, en serie, más una **comprobación propia de solapamientos dentro del grupo** (dos integrantes con la misma maquilladora en tramos que se pisan): se rechaza con un mensaje claro y no depende solo de la exclusión de Postgres.
- **Choque parcial legible:** la respuesta indica **qué integrantes** fallaron y por qué (`horario_no_disponible` o `solapa_con_otra_integrante`), para que el asistente conserve al resto.
- **Asistente de grupo en el cliente** (ADR 0008): el estado de `sessionStorage` gana un campo opcional `personas` (sin cambiar `version: 1` ni lo existente). La clienta activa "reserva grupal" en `/reservar`, agrega y quita integrantes (nombre, servicio, maquilladora, horario por persona) y no puede confirmar mientras alguna integrante no tenga nombre y horario completos.
- **Elección de horario por integrante:** desde `/reservar` cada integrante lleva al catálogo y la disponibilidad ya existentes; al elegir un horario este se asigna a esa integrante y la clienta vuelve a `/reservar`.
- **Server Action única:** `confirmarReserva` despacha a la creación individual o a la grupal según lleve o no `personas` (campo oculto con JSON validado con Zod en el servidor); el individual no cambia.
- **Página de estado** (`/reservas/[token]`): ya lista las líneas; pasa a mostrar a cada integrante con su servicio, maquilladora, día y hora, y el monto total del grupo.
- **Sin migración:** el modelo (ADR 0005) ya admite N líneas por reserva.

Fuera de alcance: pago y número de operación (#10), vencimiento lazy (#8, solo se declara el punto de integración), cancelación o reprogramación de una integrante suelta (#12 y #13; mientras tanto la reserva se cancela o reprograma entera), panel de reservas (#11), tope de reservas sin pagar por teléfono (decisión del ADR 0003), edición de la reserva ya creada y descuentos por grupo (no están en el PRD).

## Capabilities

### New Capabilities
- `group-booking`: la creación en el servidor de una reserva grupal: validación del grupo, revalidación de cada línea, ausencia de solapamientos internos, transacción única con N líneas, monto total, token, idempotencia y reporte de qué integrantes chocaron.

### Modified Capabilities
- `booking-wizard`: se agrega el armado del grupo en el cliente (modo grupal, agregar y quitar integrantes, horario por integrante, completitud obligatoria, tamaño máximo, persistencia en `sessionStorage` y conservación del resto ante un choque parcial).
- `booking-status-page`: la página muestra a cada integrante de una reserva grupal y deja claro que el monto es el total del grupo.

## Impact

- Código nuevo: `src/lib/reserva/crear-grupal.ts`, `src/lib/reserva/grupo.ts` (reglas puras: solapamientos y suma de precios), componentes del grupo en `src/components/publico/` y sus pruebas.
- Código tocado: `src/lib/reserva/esquemas.ts`, `confirmacion.ts`, `asistente.ts`, `crear.ts` (solo exportar el helper de búsqueda por clave), `src/app/reservar/actions.ts`, `src/components/publico/paso-confirmacion.tsx`, `horario-elegible.tsx`, `estado-de-reserva.tsx`.
- Base de datos: **ninguna migración**.
- Dependencias: ninguna nueva.
- Pruebas: unitarias de las reglas del grupo, de los esquemas y del asistente; de integración con Postgres real (ADR 0011) para todo o nada, choque de una línea, solapamiento interno, idempotencia del grupo y carrera de dos grupos por el mismo horario.
- Coordinación con #8 (vencimiento lazy): ambos tocan la creación de reservas; ver el punto de integración en `design.md`.
- ADR: ninguna decisión contradice un ADR; las dudas de producto (tamaño máximo, servicio por integrante) quedan como preguntas abiertas.
