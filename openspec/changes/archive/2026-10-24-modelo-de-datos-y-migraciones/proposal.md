# Proposal

## Why

La fundación (ítem #1) dejó Drizzle configurado con el esquema vacío y la suite de tests con Postgres
real. Todo lo que sigue en el backlog (auth, panel, disponibilidad, reservas, pagos) lee y escribe
sobre el modelo del ADR 0005. Además, la garantía central del negocio, que dos clientas no tomen el
mismo horario con la misma maquilladora, debe vivir en Postgres y no solo en la aplicación
(ADR 0003). Hay que fijar ese modelo y sus restricciones ahora, con tests contra el motor real,
antes de construir funcionalidad encima.

## What Changes

Este cambio cubre **únicamente el ítem #2 del backlog**, "Modelo de datos y migraciones":

- Definir en Drizzle las **7 entidades** del ADR 0005: `servicio`, `maquilladora`,
  `horario_trabajo`, `bloqueo_agenda`, `reserva`, `reserva_linea` y `usuario_admin`, con sus claves
  foráneas y sus valores controlados (estado de reserva, estado de reembolso, motivo de
  cancelación).
- Agregar la **restricción de exclusión** sobre `reserva_linea`: por maquilladora y rango de
  tiempo, solo para líneas con `activa = true`.
- Agregar `UNIQUE` sobre el número de operación de `reserva` (los nulos no colisionan) y `UNIQUE`
  con valor no adivinable sobre el token de acceso.
- Agregar restricciones de integridad que la base puede verificar sola: rangos de tiempo válidos,
  precios y duraciones no negativos, y coherencia entre estado y número de operación o motivo de
  cancelación.
- Generar la **migración inicial versionada** en `drizzle/`, incluyendo la parte en SQL a mano que
  Drizzle no puede expresar (extensión `btree_gist` y la exclusión).
- Probar todo con tests de integración contra Postgres real, incluida la aplicación de las
  migraciones sobre una base vacía y la ausencia de diferencias entre esquema y migraciones.

Fuera de este cambio (pertenecen a otros ítems): lógica de negocio sobre estas tablas, como el
vencimiento lazy y su reintento (#8), la creación transaccional de reservas y la idempotencia (#7),
la generación del token en la aplicación, Zod y Server Actions, el hash y la sesión de
`usuario_admin` (#3), el alta del admin por seed (#3), datos de ejemplo, y cualquier pantalla.

## Capabilities

### New Capabilities

- `studio-reference-data`: catálogo de servicios, maquilladoras, horarios de trabajo, bloqueos de
  agenda y usuarios administradores, con sus reglas de integridad en la base.
- `reservation-data`: reservas y líneas de reserva, con token de acceso único, número de operación
  único, estados controlados y coherencia entre estado, número de operación y motivos.
- `schedule-overlap-guard`: la base de datos impide que dos líneas activas de una misma
  maquilladora se solapen en el tiempo, y libera el horario al desactivar la línea.

### Modified Capabilities

Ninguna. `integration-testing` y `resilient-data-access` no cambian sus requisitos: este cambio
usa su infraestructura sin alterar su comportamiento.

## Impact

- **Código nuevo:** `src/db/schema.ts` (hoy vacío) y archivos de esquema asociados, y los tests de
  integración del modelo en `tests/`.
- **Migraciones:** primera migración en `drizzle/` (SQL generado más SQL a mano) y su registro en
  `drizzle/meta/`. El `globalSetup` de tests ya las aplica sin cambios.
- **Dependencias:** ninguna nueva.
- **Documentación:** una nota en `README.md` o `CLAUDE.md` sobre cómo agregar migraciones a mano
  cuando Drizzle no cubre una restricción.
- **Sistemas externos:** la migración debe ser compatible con Neon; requiere que la extensión
  `btree_gist` esté disponible allí. Aplicar la migración a la base Neon real queda para el
  despliegue, no para este cambio.
- **Restricciones respetadas:** Vercel free tier y Neon como única persistencia (ADR 0002); la
  exclusión vive en Postgres (ADR 0003 y ADR 0005).
