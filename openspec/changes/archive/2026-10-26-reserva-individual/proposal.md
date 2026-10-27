# Proposal

## Why

La clienta ya puede ver servicios y horarios libres (#6), pero no puede quedarse con uno: no existe ninguna forma de crear una reserva. Este ítem cierra el primer tramo del flujo del PRD (servicio → maquilladora → horario → confirmar) y deja a la clienta con una reserva `pendiente_pago` que ocupa el horario y con un enlace propio donde seguirla. Sin él, el pago (#10), el vencimiento (#8) y el panel de reservas (#11) no tienen nada sobre qué trabajar.

## What Changes

- **Asistente de reserva con estado en el cliente** (ADR 0008): al elegir un horario en la pantalla de disponibilidad, la selección (servicio, maquilladora, horario y datos de contacto) se guarda en el estado del cliente con respaldo en `sessionStorage` y la clienta pasa a `/reservar`, donde ve el resumen, escribe su nombre y teléfono y confirma. Una recarga no pierde lo elegido.
- **Creación de la reserva por una única Server Action** (ADR 0006 y 0009) que valida con Zod, revalida la disponibilidad y crea la reserva y su línea en una sola transacción: estado `pendiente_pago`, monto igual al precio del servicio, precio copiado a la línea y token de acceso generado por la base.
- **Choque de horario:** si otra clienta tomó el horario, la acción responde "horario ya no disponible" (traduciendo `23P01` y `40P01`, hallazgo del ítem #2) y la clienta vuelve a elegir horario sin perder lo ya escrito.
- **Idempotencia** (ADR 0009): cada intento lleva una clave generada en el cliente; un doble clic o un reenvío devuelve la misma reserva en vez de crear otra. Requiere una columna nueva (`reserva.clave_idempotencia`, única y opcional) y su migración.
- **Página de estado** `/reservas/[token]` (ADR 0004), de solo lectura: muestra el estado, el servicio, la maquilladora, el día y la hora, y el monto. El enlace es la única credencial, así que la página no se indexa, no se guarda en cachés compartidas y no filtra el token por `Referer`.
- Los horarios de la pantalla de disponibilidad pasan de informativos a **elegibles**.

Fuera de alcance: el pago, el QR y el número de operación (#10), el vencimiento a 20 minutos (#8; mientras tanto una reserva abandonada sigue ocupando el horario), la reserva grupal (#9, aunque el estado del asistente se organiza para extenderse), cancelación y reprogramación (#12 y #13), el panel de reservas (#11), el motivo de rechazo o cancelación en la página de estado (#11), notificaciones salientes (ADR 0004), un tope de reservas sin pagar por teléfono (decisión aceptada en ADR 0003) y recuperar un enlace perdido.

## Capabilities

### New Capabilities
- `booking-wizard`: el asistente de reserva del lado de la clienta: selección elegible de horario, estado persistido en `sessionStorage`, paso de confirmación con datos de contacto, clave de idempotencia por intento y conservación de lo escrito ante un choque.
- `individual-booking`: la creación de una reserva individual en el servidor: validación, revalidación de disponibilidad, transacción única, estado inicial, precios copiados, token, idempotencia y traducción del choque de horario.
- `booking-status-page`: la página de estado de la reserva por enlace con token, de solo lectura y protegida contra indexación y filtración del token.

### Modified Capabilities
- `slot-availability`: los horarios libres de la pantalla de disponibilidad dejan de ser solo informativos y pasan a poder elegirse para iniciar la reserva (cambia el escenario "Sin reserva todavía").
- `reservation-data`: la reserva admite una clave de idempotencia opcional y única.

## Impact

- Código nuevo: `src/lib/reserva/` (esquemas, creación transaccional, lectura por token, almacenamiento del asistente), `src/app/reservar/**` (paso de confirmación y Server Action), `src/app/reservas/[token]/**` (página de estado) y componentes en `src/components/publico/`.
- Código tocado: `src/db/schema.ts` y una migración nueva en `drizzle/`; `src/components/publico/pantalla-disponibilidad.tsx` (horarios elegibles); `next.config.ts` (cabeceras de las rutas con token); la prueba que cuenta las migraciones.
- Base de datos: **una columna nueva y una restricción `UNIQUE`** (primera migración desde #3). Hay que aplicarla a Neon al desplegar.
- Dependencias: ninguna nueva.
- Pruebas: unitarias de esquemas, almacenamiento y componentes; de integración con Postgres real (ADR 0011), incluidas dos reservas simultáneas por el mismo horario y el mismo envío repetido; la prueba de privacidad de la consulta pública sigue vigente.
- ADR: la columna de idempotencia concreta lo que el ADR 0009 ya decide ("una clave generada por intento") y que el ADR 0005 no listaba entre los campos de `reserva`; se anota en el diseño y conviene reflejarla en el ADR 0005.
