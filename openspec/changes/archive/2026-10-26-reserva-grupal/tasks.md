## 1. Reglas puras del grupo

- [x] 1.1 Crear `src/lib/reserva/grupo.ts` con `MIN_INTEGRANTES = 2`, `MAX_INTEGRANTES = 10`, `detectarSolapamientos` (pares de índices, misma maquilladora, rangos semiabiertos) y `sumarPrecios` (suma exacta en centavos enteros, devuelve texto con dos decimales)
- [x] 1.2 Pruebas unitarias en `src/lib/reserva/grupo.test.ts`: pisado parcial, mismo horario, contiguos, distinta maquilladora, tres integrantes con varios pares, 350.50 + 120.10 + 80.00 = 550.60, precios enteros y en cero

## 2. Esquemas de la solicitud grupal

- [x] 2.1 En `src/lib/reserva/esquemas.ts` agregar `integranteSchema` y `solicitudGrupalSchema` (clave uuid, nombre y teléfono de quien reserva con los esquemas existentes, `personas` de 2 a 10) y `erroresPorRuta` (rutas como `personas.2.nombre`); no modificar `erroresPorCampo` de `src/lib/catalogo/esquemas.ts`
- [x] 2.2 Parseo seguro del campo `personas` (JSON en un campo oculto): un JSON roto, vacío o que no sea un arreglo es solicitud inválida, nunca una excepción
- [x] 2.3 Pruebas en `src/lib/reserva/esquemas.test.ts`: 1 y 11 integrantes, nombre vacío y de 101 caracteres, servicio u horario faltante, JSON roto, `personas` que no es arreglo, contacto inválido, rutas de error por integrante

## 3. Creación grupal en el servidor

- [x] 3.1 Exportar `tokenDeLaClave` desde `src/lib/reserva/crear.ts` (único cambio en ese archivo, para no chocar con el ítem #8)
- [x] 3.2 Crear `src/lib/reserva/crear-grupal.ts` con `crearReservaGrupal(db, solicitud, ahora)`: atajo de idempotencia, carga en serie de servicios y maquilladoras activos sin repetir, `detectarSolapamientos`, revalidación con `consultarDisponibilidad` una vez por par (maquilladora, duración) y en serie, acumulación de `noDisponibles`, `horariosNoDisponibles` y `solapamientos`
- [x] 3.3 En la misma función: re-búsqueda de la clave antes de rechazar, `db.transaction` solo con los inserts de la reserva (monto con `sumarPrecios`) y de cada línea en serie con el índice de la integrante anotado, y traducción de `23P01`, `40P01` y `23505` (clave) fuera de la transacción, repitiendo la revalidación para señalar todas las integrantes afectadas y cayendo a la integrante cuyo insert falló
- [x] 3.4 Aislar la inserción de una línea en `insertarLinea(tx, linea)` y documentar en un comentario el punto de integración con el vencimiento lazy (#8): aplicarlo a cada línea y mantener el todo o nada, incluidas las cancelaciones por vencimiento hechas dentro de la transacción
- [x] 3.5 Pruebas de integración con Postgres real en `src/lib/reserva/crear-grupal.int.test.ts`: grupo de tres con servicios y maquilladoras distintos (líneas, `fin` por servicio, monto 550.60, un token), precio copiado ante un cambio del catálogo, línea ocupada entre libres (no queda nada y se señala la correcta), varias líneas afectadas, solapamiento interno, turnos contiguos válidos, solapamiento y horario ocupado juntos, servicio y maquilladora inactivos, horario pasado o fuera de grilla
- [x] 3.6 Pruebas de integración de atomicidad y concurrencia en `src/lib/reserva/crear-grupal.atomicidad.int.test.ts`: fallo inyectado al insertar la tercera línea (no queda reserva ni líneas), dos grupos simultáneos por el mismo horario repetidos varias veces (uno completo, el otro rechazado, sin filas a medias), grupo contra reserva individual en la última línea
- [x] 3.7 Pruebas de idempotencia del grupo: reenvío, misma clave simultánea, claves distintas por los mismos horarios, reenvío cuando los horarios ya no se ofrecen porque son suyos

## 4. Confirmación y Server Action

- [x] 4.1 En `src/lib/reserva/confirmacion.ts`: `procesarConfirmacion` detecta el campo `personas`, valida con `solicitudGrupalSchema` y llama a `deps.crearGrupo`; agregar `grupo_rechazado` (con `noDisponibles`, `horariosNoDisponibles`, `solapamientos`) a `ResultadoConfirmacion`; el camino individual no cambia
- [x] 4.2 En `src/app/reservar/actions.ts` pasar `crearGrupo: (s) => crearReservaGrupal(getDb(), s, new Date())` junto a `crear`
- [x] 4.3 Pruebas en `src/lib/reserva/confirmacion.test.ts` y `src/app/reservar/actions.test.ts` con dependencias simuladas: despacho individual y grupal, errores por integrante, JSON manipulado, entrada con archivo en `personas`

## 5. Estado del asistente de grupo

- [x] 5.1 En `src/lib/reserva/asistente.ts` agregar los campos opcionales `personas` y `personaActiva` al esquema sin cambiar `version: 1`; un `personas` mal formado invalida todo el estado
- [x] 5.2 Agregar funciones puras con `Storage` inyectado: `activarGrupo`, `agregarIntegrante` (tope de 10), `quitarIntegrante`, `renombrarIntegrante`, `marcarActiva`, `elegirParaIntegrante` e `integrantesIncompletas`; regenerar la clave al cambiar cualquier selección y no al renombrar
- [x] 5.3 Pruebas en `src/lib/reserva/asistente.test.ts`: activar, agregar hasta 10 y rechazar la 11, quitar, elegir para una integrante sin tocar a las demás, clave nueva al cambiar la selección y misma clave al renombrar, estado individual guardado antes de este cambio, `personas` dañado

## 6. Interfaz del grupo

- [x] 6.1 Crear `src/components/publico/lista-integrantes.tsx` (cliente): nombre editable por integrante, resumen de su servicio, maquilladora, día y hora de Lima o "Falta elegir el horario", botones "Elegir horario" y "Quitar", "Agregar integrante" deshabilitado en 10 con la nota del límite, marcas de choque por integrante (horario no disponible, servicio o maquilladora inactivos, solapamiento con el nombre de la otra)
- [x] 6.2 Extender `src/components/publico/paso-confirmacion.tsx`: interruptor "Reservar para un grupo", modo grupal con la lista, monto total con `sumarPrecios`, campo oculto `personas` con el JSON, botón de confirmar deshabilitado mientras `integrantesIncompletas` no sea vacío con la lista de lo que falta, manejo de `grupo_rechazado`, e inicio del flujo de "Elegir otro horario" para una integrante afectada con su misma maquilladora; el camino individual sin cambios
- [x] 6.3 Extender `src/components/publico/horario-elegible.tsx`: con `personaActiva` llama a `elegirParaIntegrante` y vuelve a `/reservar`; sin ella se comporta como hoy
- [x] 6.4 Ajustar `src/components/publico/estado-de-reserva.tsx`: `key` por índice (sin colisión entre homónimas), título "Tus turnos" si hay más de un turno, nombre de la integrante y monto total del grupo
- [x] 6.5 Pruebas de componentes (`lista-integrantes.test.tsx`, `paso-confirmacion.test.tsx`, `horario-elegible.test.tsx`, `estado-de-reserva.test.tsx`): modo grupal, límite de 10, botón deshabilitado con integrantes incompletas, choque parcial que conserva al resto, elección para una integrante, homónimas a la misma hora en la página de estado

## 7. Verificación

- [x] 7.1 Revisar que no hay migración nueva: `npm run db:generate` responde "No schema changes"
- [x] 7.2 Ejecutar `npm run lint`, `npm run test:unit` y `npm run test` (Docker) y `npm run build`
- [ ] 7.3 Comprobar a mano el flujo grupal en `npm run dev`: armar un grupo de tres con distintas maquilladoras, recargar, provocar un choque parcial con otra reserva y confirmar que solo se marca a la afectada, completar y abrir la página de estado
- [x] 7.4 Coordinar con el ítem #8: confirmar que `insertarLinea` usa su rutina de liberación por línea y que el todo o nada revierte las cancelaciones por vencimiento
