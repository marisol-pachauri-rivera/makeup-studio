# Proposal

## Why

Hoy los servicios y las maquilladoras solo pueden cargarse tocando la base de datos a mano. Sin ellos no hay nada que mostrar en el catálogo público (#6), ni a quién cargarle horarios y bloqueos (#5), ni con qué armar reservas. El studio necesita administrar su oferta por sí mismo desde el panel, que ya tiene autenticación (#3).

## What Changes

- Sección `/admin/servicios` del panel: listado de todos los servicios (activos e inactivos), alta, edición y desactivación o reactivación. Campos: nombre, descripción, precio y duración en minutos.
- Sección `/admin/maquilladoras` del panel: listado, alta, edición del nombre y desactivación o reactivación.
- Server Actions de escritura para ambas secciones, cada una con `requerirAdmin()` como primera línea y entradas validadas con Zod en el servidor (ADR 0006), con mensajes de error en español por campo.
- Enlaces de navegación a las dos secciones en la cabecera del panel.
- Nunca se borra: "desactivar" es la única baja. Las reservas y líneas existentes conservan su historial y sus precios (ADR 0005).
- Componentes de shadcn/ui que faltan (tabla, área de texto, etiqueta de estado) agregados con el CLI (ADR 0010).

Fuera de alcance: horarios de trabajo y bloqueos de agenda (#5), la lectura pública del catálogo y la disponibilidad (#6), borrar registros, reordenar el catálogo, categorías o imágenes de servicios (no hay almacenamiento de archivos), asignar qué servicios hace cada maquilladora (el modelo no lo contempla: toda maquilladora activa puede atender cualquier servicio activo), advertir o cancelar reservas futuras al desactivar una maquilladora (el studio las gestiona desde el panel de reservas, #11), y cualquier cambio de esquema o migración.

## Capabilities

### New Capabilities
- `service-catalog-management`: alta, edición, desactivación y reactivación de servicios desde el panel, con validación del servidor y sin afectar a las reservas ya hechas.
- `makeup-artist-management`: alta, edición, desactivación y reactivación de maquilladoras desde el panel, con validación del servidor y conservación del historial.

### Modified Capabilities
<!-- Ninguna: las restricciones de datos de `studio-reference-data` (precio no negativo, duración positiva, sin borrado con historial) ya existen y no cambian. -->

## Impact

- Código nuevo: `src/app/admin/(panel)/servicios/**` y `src/app/admin/(panel)/maquilladoras/**` (páginas, formularios y `actions.ts`), lógica de datos y esquemas Zod en `src/lib/catalogo/`.
- Código tocado: `src/app/admin/(panel)/layout.tsx` (navegación) y `src/app/admin/(panel)/page.tsx` (enlaces de entrada).
- Base de datos: sin cambios de esquema ni migraciones; usa `servicio` y `maquilladora` tal como están.
- Dependencias: ninguna nueva. Componentes de shadcn/ui agregados al repo.
- Pruebas: unitarias de esquemas y formularios, de integración con Postgres real (ADR 0011), y la prueba de convención de #3 cubre automáticamente los nuevos `actions.ts`.
- Documentación: `README.md` solo si hace falta mencionar las nuevas secciones.
