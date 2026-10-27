# Proposal

## Why

La clienta todavía no puede ver qué ofrece el studio ni cuándo hay lugar: la portada es un título y la agenda que el studio cargó en el panel (#4 y #5) no se muestra en ningún sitio público. Sin catálogo y sin horarios libres no existe el primer tramo del flujo de reserva (servicio → maquilladora → horario) y el #7 no tiene qué elegir. Este ítem entrega la parte de lectura, sin crear reservas.

## What Changes

- **Portada pública con el catálogo:** `/` lista los servicios activos con nombre, descripción, precio y duración, cada uno con un acceso a sus horarios. No requiere cuenta.
- **Pantalla de disponibilidad** `/servicios/[servicioId]/disponibilidad`: la clienta elige una maquilladora entre todas las activas (nunca se asigna una automáticamente), después un día y ve los horarios libres de ese día.
- **Cálculo de horarios libres** para un servicio y una maquilladora, en hora local del studio (`America/Lima`): inicios en una grilla de 30 minutos dentro de los tramos de `horario_trabajo`, solo si el servicio completo cabe en el tramo, sin cruzar un `bloqueo_agenda` ni una línea de reserva activa, y sin horarios que ya pasaron. Se ofrecen los próximos 30 días.
- Los servicios y maquilladoras inactivos no se ofrecen, y sus rutas directas responden "no encontrado".
- Diseño mobile-first con los componentes de shadcn/ui existentes (ADR 0010).
- Los horarios se muestran pero **no se pueden reservar todavía**: elegirlos y crear la reserva es el ítem #7.

Fuera de alcance: crear reservas o conservar la elección (#7, ADR 0008), tratar como libres las reservas vencidas a los 20 minutos (#8; mientras tanto toda línea activa ocupa el horario, que es el lado seguro), reserva grupal (#9), pago (#10), calendario visual del panel (#14), caché del catálogo o de la disponibilidad (la disponibilidad debe reflejar una reserva recién creada), asignar qué servicios hace cada maquilladora (el modelo no lo contempla), y cualquier cambio de esquema o migración.

## Capabilities

### New Capabilities
- `public-service-catalog`: catálogo público de servicios activos con precio y duración, y elección de una maquilladora activa, sin cuenta y sin asignación automática.
- `slot-availability`: cálculo y consulta pública de los horarios libres de una maquilladora para un servicio, según horario de trabajo, bloqueos, reservas activas, duración y hora local del studio.

### Modified Capabilities
<!-- Ninguna: no cambia ningún requisito de los specs existentes. `schedule-overlap-guard` sigue siendo la garantía final contra el solapamiento; este ítem solo lee. -->

## Impact

- Código nuevo: `src/lib/disponibilidad/` (fechas locales, cálculo de huecos, consulta con la base inyectada), `src/lib/publico/` (lecturas de servicios y maquilladoras activos), `src/app/servicios/[servicioId]/disponibilidad/**` y componentes de presentación.
- Código tocado: `src/app/page.tsx` (la portada pasa a ser el catálogo) y, si hace falta, el layout público.
- Base de datos: solo lecturas sobre `servicio`, `maquilladora`, `horario_trabajo`, `bloqueo_agenda` y `reserva_linea`; sin cambios de esquema ni migraciones.
- Dependencias: ninguna nueva. Reutiliza `ZONA_STUDIO` y las conversiones de `src/lib/agenda/zona-horaria.ts`.
- Pruebas: unitarias del cálculo de huecos y de las fechas, de integración con Postgres real (ADR 0011), de componentes y de las rutas públicas sin sesión.
