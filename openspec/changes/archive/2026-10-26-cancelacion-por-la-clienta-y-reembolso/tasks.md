# Tasks

## 1. Regla de cancelación y reembolso (capa de datos)

- [x] 1.1 Crear `src/lib/cancelacion/plazo.ts` con `PLAZO_CANCELACION_HORAS = 24`, `limiteDeCancelacion(primerTurno: Date): Date` y `puedeCancelar(primerTurno, ahora)` (permitido con exactamente 24 h). Pruebas unitarias: 24 h exactas sí, 23 h 59 min no, 25 h sí. Verificar con `npm run test:unit`.
- [x] 1.2 Crear `src/lib/cancelacion/cancelar.ts` con `cancelarReservaDeLaClienta(db, { token }, ahora)`: en `db.transaction` y en serie, `UPDATE reserva` condicionado (estado en `pendiente_pago|pendiente_validacion|confirmada`, primer turno activo >= `ahora` + 24 h) con `CASE` para `estado_reembolso`, luego `UPDATE reserva_linea SET activa=false`; resultados `cancelada | ya_cancelada | fuera_de_plazo | no_encontrada` (lectura de explicación si no afectó filas). Verificar con las pruebas de 1.3.
- [x] 1.3 Pruebas de integración `src/lib/cancelacion/cancelar.int.test.ts` con Postgres real (`beforeEach` limpia): confirmada → `cancelada`/`clienta`/`pendiente`; `pendiente_pago` → `no_aplica`; `pendiente_validacion` → `pendiente`; grupo de 3 líneas inactivas a la vez; límite de 24 h exacto y 23 h 59 min; grupo con primer turno cercano; ya cancelada por `clienta`, `vencida` y `studio` (sin cambios); token desconocido; el número de operación se conserva; la disponibilidad vuelve a ofrecer el horario. Verificar con `npm run test`.
- [x] 1.4 Pruebas de carrera `src/lib/cancelacion/cancelar-carrera.int.test.ts` con dos conexiones (limpieza manual, como `ingreso-carrera.int.test.ts`): doble envío simultáneo (una cancela, la otra `ya_cancelada`); cancelar contra validar (queda `cancelada` y `pendiente`, nunca `confirmada` con líneas inactivas); cancelar contra rechazar (`cancelada`, `no_aplica`, líneas inactivas, número libre o conservado según el orden pero CHECK satisfechos). Repetir varias veces. Verificar con `npm run test`.

## 2. Gestión del reembolso en el panel

- [x] 2.1 Crear `src/lib/cancelacion/reembolsos.ts` con `listarReembolsosPendientes(db)` (monto, número de operación, nombre y teléfono, más antiguos primero) y `marcarReembolsoRealizado(db, id)` (`UPDATE` condicionado a `pendiente`; resultados `realizado | ya_realizado | no_aplica | no_encontrada`). Pruebas de integración `reembolsos.int.test.ts`: lista y orden, vacío, marcar, repetir, `no_aplica`, inexistente, doble marcado simultáneo. Verificar con `npm run test`.
- [x] 2.2 Crear `src/lib/cancelacion/formulario-reembolso.ts` (`procesarMarcado`, puro, valida el id con Zod) con pruebas unitarias (id inválido, resultados traducidos a mensajes). Verificar con `npm run test:unit`.
- [x] 2.3 Crear `src/app/admin/(panel)/reembolsos/actions.ts` (`"use server"`, empieza con `await requerirAdmin()`, `revalidatePath` de la sección) y `src/app/admin/(panel)/reembolsos/page.tsx` (sesión con `requerirAdminOLogin()` dentro de `<Suspense>`, tabla con botón "Marcar como realizado", estado vacío). Pruebas del componente de la tabla y de la acción sin sesión; `tests/auth/acciones-del-panel.test.ts` debe seguir en verde. Verificar con `npm run test`.
- [x] 2.4 Agregar el enlace "Reembolsos" a la navegación del panel en `src/app/admin/(panel)/layout.tsx` (una línea, coordinar con #11 y #14 por si también la tocan). Verificar abriendo `/admin` con `npm run dev` fuera de las pruebas compartidas, o con una prueba del layout si existe.

## 3. Página de estado de la clienta

- [x] 3.1 En `src/lib/reserva/estado.ts`, agregar `estadoReembolso` y `puedeCancelarHasta` (primer turno activo menos 24 h, `null` si no aplica) a `EstadoDeReserva` sin leer teléfono ni número de operación; solo agregar campos, no reordenar la consulta. Actualizar `estado.int.test.ts`: reembolso en cada estado, plazo con grupo, `null` en cancelada. Verificar con `npm run test`.
- [x] 3.2 Crear `src/app/reservas/[token]/actions.ts#cancelarReserva` (junto a `ingresarNumero`, sin tocarla; Zod sobre el token; `refresh()` al éxito) y `src/lib/cancelacion/formulario.ts` (`procesarCancelacion` puro con mensajes: ya cancelada, fuera de plazo, no encontrada). Pruebas unitarias de `procesarCancelacion`. Verificar con `npm run test:unit`.
- [x] 3.3 Crear `src/components/publico/boton-cancelar.tsx` (confirmación en dos pasos, `useActionState`, deshabilitado pasado el plazo con aviso de escribir al studio, fecha límite en hora de Lima) y `src/components/publico/texto-reembolso.tsx` (monto, el studio lo gestiona, estado pendiente/realizado, sin plazos; `no_aplica` dice que no hay pago que devolver). Pruebas de componentes (jsdom): dentro del plazo, plazo vencido, paso de confirmación, textos de reembolso. Verificar con `npm run test`.
- [x] 3.4 Integrar ambos en `src/components/publico/estado-de-reserva.tsx` (nueva prop opcional `cancelacion`, mostrar el texto del reembolso en reservas canceladas por la clienta, sin cambiar la sección de pago ni los textos existentes) y pasar `accion` y `ahora` desde `src/app/reservas/[token]/page.tsx`. Actualizar `estado-de-reserva.test.tsx`. Verificar con `npm run test`.
- [x] 3.5 Prueba que mantenga la protección del enlace: la página sigue `noindex` y las cabeceras de `next.config.ts` siguen cubriendo `/reservas/:token` (leer y afirmar, sin cambiarlas). Verificar con `npm run test:unit`.

## 4. Cierre

- [x] 4.1 Agregar a `README.md` una nota breve del flujo de cancelación (plazo de 24 h, reembolso manual y sección del panel). Verificar leyendo la sección.
- [x] 4.2 Correr `npm run lint`, `npm run build` y `npm run test` completos y `openspec validate cancelacion-por-la-clienta-y-reembolso --strict`; comprobar que lo anterior sigue verde.

## Workflow follow-up

- Archivar con `/opsx:archive` tras revisar (crea `client-cancellation` y `refund-tracking`; agrega requisitos a `booking-status-page`).
- Si #11 ya muestra una columna de reembolso en su lista, enlazarla a `/admin/reembolsos` o agregar ahí el filtro "reembolsos pendientes" reutilizando `listarReembolsosPendientes`.
- #13 (reprogramar) comparte la regla de 24 h: reutilizar `src/lib/cancelacion/plazo.ts`.
