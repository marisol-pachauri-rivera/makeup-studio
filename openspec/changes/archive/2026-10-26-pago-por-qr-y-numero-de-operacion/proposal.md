# Proposal

## Why

La clienta ya puede reservar (#7 y #9) y la reserva vence si no paga (#8), pero no existe ninguna forma de pagar: la página de estado dice "falta completar el pago" y no ofrece cómo. Este ítem completa el paso 5 del flujo del PRD: la clienta ve el QR de la billetera electrónica del studio, paga desde su celular e ingresa el número de operación, y la reserva pasa a `pendiente_validacion` para que el studio la revise (#11). Sin él ninguna reserva puede salir de `pendiente_pago`.

## What Changes

- **Sección de pago en la página de estado** (`/reservas/<token>`): cuando la reserva está en `pendiente_pago` muestra el QR de la billetera del studio, el monto exacto a pagar, el plazo de 20 minutos y un campo para el número de operación. No hay subida de archivos.
- **Plazo visible:** hasta qué hora de Lima tiene para pagar (creación + 20 minutos). Una reserva devuelta por un rechazo no muestra plazo, porque no vence. Si el plazo ya pasó y nadie tomó el horario, la clienta todavía puede ingresar su número (ADR 0003), con un aviso claro.
- **Ingreso del número de operación** por una Server Action pública: valida con Zod, normaliza el número (sin espacios sobrantes y en mayúsculas, para que la unicidad no se burle por un cambio de mayúsculas) y hace **un solo `UPDATE` condicionado** a que la reserva siga en `pendiente_pago` y sin número: pasa a `pendiente_validacion`. Es lo que decide la carrera contra el vencimiento (#8).
- **Unicidad:** un número ya usado en otra reserva se rechaza con un mensaje claro y la reserva no cambia de estado. Un número vacío no modifica nada.
- **Reserva ya vencida:** si fue cancelada por vencimiento, la acción se rechaza explicando que venció y que debe elegir otro horario; la página de estado pasa a explicar el vencimiento con un enlace al catálogo.
- **Doble clic o reenvío:** reenviar el mismo número a una reserva que ya lo tiene es un éxito, no un error.
- **Configuración del QR:** el QR y el nombre de la billetera salen de variables de entorno (`QR_PAGO_URL`, `BILLETERA_NOMBRE`). Sin QR configurado la página lo dice y no ofrece el campo, para que nadie pague a ciegas.

Fuera de alcance: validar o rechazar el pago y mostrar el motivo del rechazo (#11), cancelación y reembolso (#12), reprogramación (#13), generar el QR desde el sistema (es una imagen fija del studio; no hay pasarela), subir comprobantes (no está en el alcance del PRD), recordatorios de pago (ADR 0004), y cualquier cambio de esquema o migración.

## Capabilities

### New Capabilities
- `booking-payment`: la sección de pago de la página de estado (QR, monto, plazo), el ingreso del número de operación con su validación, unicidad e idempotencia, y el rechazo cuando la reserva ya venció.

### Modified Capabilities
- `booking-status-page`: la página de una reserva pendiente de pago ofrece pagar, y una reserva cancelada por vencimiento se explica como vencida con una salida para elegir otro horario.

## Impact

- Código nuevo: `src/lib/pago/` (esquema del número, configuración del QR, ingreso del número), `src/app/reservas/[token]/actions.ts` (Server Action pública) y componentes de pago en `src/components/publico/`.
- Código tocado: `src/lib/reserva/estado.ts` (el modelo de lectura suma el plazo y el motivo de cancelación), `src/components/publico/estado-de-reserva.tsx`, `src/app/reservas/[token]/page.tsx`, `.env.example`, `README.md`.
- Base de datos: **sin migración**; `numero_operacion` ya es `UNIQUE` y la coherencia estado/número ya la hace cumplir un `CHECK` (ADR 0005).
- Dependencias: ninguna nueva. Reutiliza `condicionVencida` y `PLAZO_VENCIMIENTO_MINUTOS` de #8.
- Variables de entorno nuevas: `QR_PAGO_URL` y `BILLETERA_NOMBRE` (no son secretos).
- Pruebas: unitarias del esquema, la configuración y los componentes; de integración con Postgres real (ADR 0011), incluida la carrera contra el vencimiento con la función real de ingreso y dos ingresos simultáneos del mismo número.
- **Datos que faltan del studio:** la imagen del QR, el nombre de su billetera y cómo se ven sus números de operación (el formato aceptado es un supuesto).
