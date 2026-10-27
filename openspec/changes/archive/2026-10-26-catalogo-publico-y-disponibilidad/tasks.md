# Tasks

## 1. Cálculo de huecos

- [x] 1.1 Crear `src/lib/disponibilidad/constantes.ts` (`INTERVALO_MINUTOS = 30`, `DIAS_HORIZONTE = 30`) y `fechas.ts` (`hoyLocal`, `sumarDias`, `diaDeLaSemana` sobre fechas `YYYY-MM-DD`, reutilizando `aPartesLocales`). Pruebas unitarias: "hoy" en Lima cuando en UTC ya es el día siguiente (03:00 UTC del 25/12 es 24/12), suma de días cruzando mes y año, día de la semana de fechas conocidas (el 2026-12-25 es viernes), y mismo resultado con distintos `TZ` del proceso. Verificar con `npm run test:unit`.
- [x] 1.2 Crear `src/lib/disponibilidad/huecos.ts` con `calcularHuecos({ tramos, ocupados, duracionMinutos, ahora })` según la decisión 1 del diseño (fusión de tramos contiguos (spec "Tramos contiguos como uno solo"), grilla anclada al inicio del tramo, servicio completo dentro del tramo, exclusión semiabierta de ocupados, nada anterior a `ahora`, 30 días, horas locales inexistentes descartadas). Pruebas unitarias con los escenarios de `slot-availability`: cabe y no cabe, dos tramos, tramos contiguos, día sin tramos, grilla desde 09:15, bloqueo en medio, bloqueo de varios días, reserva contigua (09:00 y 11:00 se ofrecen), "hoy" a las 10:10 empieza en 10:30, hoy sin huecos no aparece, ningún día pasado los 30, y `TZ` del proceso distintos. Verificar con `npm run test:unit`.

## 2. Lecturas y consulta con la base

- [x] 2.1 Crear `src/lib/publico/catalogo.ts` (`listarServiciosActivos` por nombre, `obtenerServicioActivo`, `listarMaquilladorasActivas`, `obtenerMaquilladoraActiva`, con la base inyectada; los inactivos nunca se devuelven). Pruebas de integración con Postgres real: solo activos, orden por nombre, precio exacto `350.50` como texto, inactivo e inexistente devuelven `undefined`. Verificar con `npm run test`.
- [x] 2.2 Crear `src/lib/disponibilidad/consulta.ts` con `consultarDisponibilidad(db, { servicio, maquilladoraId, ahora })`: carga los tramos de la maquilladora, sus bloqueos y sus líneas activas que cruzan la ventana (seleccionando solo `inicio` y `fin`, nunca datos personales) y llama a `calcularHuecos`. Pruebas de integración con Postgres real: línea activa y reserva `pendiente_pago` ocupan, línea inactiva libera, línea contigua no ocupa, reserva de otra maquilladora no afecta, bloqueo de varios días, bloqueo de otra maquilladora no afecta, maquilladora sin horarios devuelve vacío, horarios convertidos desde Lima y no desde UTC, y reservas fuera de la ventana no cambian el resultado. Verificar con `npm run test`.

## 3. Pantallas públicas

- [x] 3.1 Reemplazar `src/app/page.tsx` por el catálogo: lista de servicios activos (nombre, descripción, precio con dos decimales, duración, acceso a `/servicios/<id>/disponibilidad`), lectura de la base dentro de `<Suspense>`, estado vacío y diseño mobile-first con los componentes existentes de shadcn/ui, en `src/components/publico/`. Pruebas de componente: precio exacto, servicio sin descripción, sin servicios activos (sin enlace de reserva), enlace al destino correcto. Verificar con `npm run test:unit` y `npm run build`.
- [x] 3.2 Crear `src/lib/disponibilidad/parametros.ts` (esquema Zod de `maquilladora` y `fecha` que nunca lanza: inválido equivale a ausente) con pruebas unitarias: `abc`, `0`, `2026-02-30`, vacío, repetido y válido. Verificar con `npm run test:unit`.
- [x] 3.3 Crear `src/app/servicios/[servicioId]/disponibilidad/page.tsx` con sus componentes: `notFound()` si el servicio es inválido, inexistente o inactivo; selector de maquilladoras activas (sin preselección, enlaces con `?maquilladora=`); con maquilladora válida y activa, selector de días con disponibilidad (enlaces con `&fecha=`, día actual con `aria-current`) y lista de horarios del día elegido, que por defecto es el primero con disponibilidad; mensajes para sin maquilladoras activas, maquilladora sin horarios y fecha inválida o sin horarios; fechas en español; horarios no interactivos y sin datos de otras clientas; parámetros y base leídos dentro de `<Suspense>`. Pruebas de componente: sin maquilladora no hay horarios, activa marcada, días y horarios del día, día por defecto, mensajes de vacío. Verificar con `npm run test:unit` y `npm run build`.

## 4. Integración final

- [x] 4.1 Actualizar `README.md` con una sección breve del sitio público (qué muestra, grilla de 30 minutos, 30 días, hora de Lima, que aún no se puede reservar). Verificar leyendo la sección.
- [x] 4.2 Correr `npm run lint`, `npm run build` y `npm run test` completos; confirmar que los 476 tests anteriores siguen pasando junto con los nuevos y que `openspec validate catalogo-publico-y-disponibilidad --strict` pasa. Verificar con `curl` sobre `npm run start` que `/` responde 200 sin sesión y que `/servicios/abc/disponibilidad` muestra la página "No encontramos esa página" con `noindex`. Nota: con `cacheComponents`, un `notFound()` dentro de `<Suspense>` ya envió el estado 200 con el resto de la página (igual que el panel), así que el estado HTTP no es 404; lo que ve la clienta y los buscadores es "no encontrado".
- [ ] 4.3 Recorrido manual con Chrome headless contra la base de Neon (catálogo, elegir maquilladora, día y horarios, servicio inactivo por enlace directo). No requiere login, pero sí datos cargados en Neon (servicio, maquilladora y horarios); si no están, dejarlo anotado como pendiente en el resumen.

## Workflow follow-up

- Archivar el change con `/opsx:archive` tras revisar el resultado (se crean los specs `public-service-catalog` y `slot-availability`).
- Para #7: reutilizar `calcularHuecos` / `consultarDisponibilidad` para validar el horario elegido, y traducir `23P01` y `40P01` a "horario ya no disponible" (hallazgo del ítem #2).
- Para #8: excluir las reservas vencidas en la consulta de líneas activas de `consulta.ts`, sin tocar `calcularHuecos`.
- Confirmar con el studio la zona horaria, la grilla de 30 minutos, la ventana de 30 días y la moneda del precio.
