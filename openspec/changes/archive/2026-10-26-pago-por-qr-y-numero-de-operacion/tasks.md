# Tasks

## 1. Configuración del QR y esquema del número

- [x] 1.1 Crear `src/lib/pago/configuracion.ts` con `leerConfiguracionDePago(env)`: `QR_PAGO_URL` (URL `https://` o ruta que empieza con `/`) y `BILLETERA_NOMBRE` opcional; devuelve `null` sin QR válido. Pruebas unitarias: URL `https`, ruta de `public/`, `http` y `javascript:` rechazadas, vacío, espacios, nombre por defecto y nombre configurado. Verificar con `npm run test:unit`.
- [x] 1.2 Crear `src/lib/pago/esquemas.ts` con `numeroOperacionSchema` (recortado, obligatorio, 4 a 30 caracteres, letras, números y guiones sin espacios interiores, a mayúsculas) e `ingresoSchema` (con `token` uuid). Pruebas unitarias: vacío y solo espacios (mensaje de obligatorio), 3, 4, 30 y 31 caracteres, minúsculas normalizadas, " ab12 " recortado, símbolos, espacios interiores, guiones, token inválido. Verificar con `npm run test:unit`.

## 2. Lectura de la reserva

- [x] 2.1 En `src/lib/reserva/estado.ts` agregar al modelo `plazoPagoHasta` (creación más `PLAZO_VENCIMIENTO_MINUTOS`, solo en `pendiente_pago` sin motivo de rechazo; `null` en otro caso) y `motivoCancelacion`, seleccionando `motivo_rechazo` solo para calcular el plazo y sin devolverlo. Pruebas de integración con Postgres real: plazo de una reserva recién creada, `null` si fue devuelta por un rechazo, `null` en validación, confirmada y cancelada, `motivoCancelacion` `vencida` y `studio`, y que la prueba de privacidad sigue sin ver teléfono, nombre de contacto, número de operación ni clave (actualizar las claves esperadas). Verificar con `npm run test`.

## 3. Ingreso del número en el servidor

- [x] 3.1 Crear `src/lib/pago/ingreso.ts` con `ingresarNumeroDeOperacion(db, { token, numero })` según la decisión 3 del diseño: un `UPDATE` condicionado a `pendiente_pago` y sin número, `23505` sobre `reserva_numero_operacion_unico` a `numero_usado`, y la lectura de explicación (`no_encontrada`, `registrado` idempotente, `pago_ya_informado`, `ya_confirmada`, `vencida`, `cancelada`) con un reintento si la reserva sigue pendiente. Verificar con `npm run test`.
- [x] 3.2 Pruebas de integración con Postgres real en `src/lib/pago/ingreso.int.test.ts`: ingreso válido que pasa a `pendiente_validacion`, normalización a mayúsculas, número ya usado (también con otras mayúsculas) que deja la reserva intacta y sin número, reserva con el plazo pasado que nadie canceló acepta el número, cancelada por vencimiento rechazada y sin cambios, cancelada por otro motivo, confirmada, reenvío del mismo número (éxito sin cambios), otro número en una reserva ya informada (rechazado y el guardado no cambia), reserva devuelta por un rechazo que acepta un número, grupo con varias líneas, y token inexistente. Verificar con `npm run test`.
- [x] 3.3 Pruebas de carrera en `src/lib/pago/ingreso-carrera.int.test.ts` (dos conexiones reales, limpieza antes y después): el ingreso confirmado antes de que otra clienta tome el horario vencido conserva la reserva y la otra recibe horario no disponible, usando `crearReservaIndividual` e `ingresarNumeroDeOperacion` reales; la cancelación por vencimiento confirmada primero hace que el ingreso se rechace como `vencida`; y dos reservas con el mismo número a la vez, repetido varias veces (una `registrado`, la otra `numero_usado`, sin estados a medias). Verificar con `npm run test`.

## 4. Formulario y Server Action

- [x] 4.1 Crear `src/lib/pago/formulario.ts` con `procesarIngreso(formData, deps)`: valida con `ingresoSchema`, devuelve `registrado`, `invalido` (error del campo y valor escrito) o `rechazado` con el motivo y su texto en español, sin lanzar con entradas manipuladas (campo ausente, archivo, token inválido). Pruebas unitarias con la dependencia simulada para cada resultado. Verificar con `npm run test:unit`.
- [x] 4.2 Crear `src/app/reservas/[token]/actions.ts` con `ingresarNumero(estado, formData)`: llama a `procesarIngreso` con `ingresarNumeroDeOperacion(getDb(), …)`, hace `refresh()` tras `registrado` y no usa `requerirAdmin()`. Pruebas con las dependencias simuladas: éxito con `refresh`, rechazo sin `refresh`, entrada inválida sin tocar la base, sin sesión, y que un error inesperado se relanza. Verificar con `npm run test`.

## 5. Pantalla

- [x] 5.1 Crear `src/components/publico/seccion-de-pago.tsx` y `formulario-numero.tsx`: monto exacto, QR con `alt` que nombra la billetera, instrucciones, plazo con la hora de Lima (y el aviso de plazo pasado sin cancelar), sin plazo para una reserva devuelta por un rechazo, sin QR configurado sin el campo, errores junto al campo, botón deshabilitado mientras envía, y `vencida` con el enlace a elegir otro horario. Pruebas de componente para cada caso. Verificar con `npm run test:unit`.
- [x] 5.2 Integrar en `estado-de-reserva.tsx` y `src/app/reservas/[token]/page.tsx`: la sección de pago solo en `pendiente_pago`, el texto y el enlace de una reserva cancelada por vencimiento, la configuración leída en el servidor y la hora actual tomada tras `params`. Actualizar las pruebas existentes de la página de estado (la reserva pendiente de pago ahora ofrece pagar) y agregar: no hay sección de pago en validación, confirmada ni cancelada, y el texto de vencida. Verificar con `npm run test:unit` y `npm run build`.

## 6. Cierre

- [x] 6.1 Agregar `QR_PAGO_URL` y `BILLETERA_NOMBRE` a `.env.example` con una explicación, documentar el pago en `README.md` (dónde se configura el QR, el formato del número, qué pasa con una reserva vencida) y anotar en `adrs/0005-modelo-de-datos.md` que el número de operación se guarda normalizado. Verificar leyendo las secciones.
- [x] 6.2 Correr `npm run lint`, `npm run build` y `npm run test` completos; confirmar que las pruebas anteriores siguen pasando junto con las nuevas y que `openspec validate pago-por-qr-y-numero-de-operacion --strict` pasa. Verificar con `curl` sobre `npm run start` que `/reservas/<token>` sigue con sus cabeceras de protección y que un token desconocido se ve como no encontrado.
- [ ] 6.3 Recorrido manual contra la base de Neon con la migración 0004 aplicada y datos cargados: reservar, ver el QR y el plazo, ingresar un número, comprobar `pendiente_validacion`, repetir el envío y probar un número ya usado. Requiere el QR del studio en `QR_PAGO_URL`; si no están, dejarlo anotado como pendiente en el resumen.

## Workflow follow-up

- Archivar con `/opsx:archive` tras revisar el resultado (se crea la spec `booking-payment`; se modifica `booking-status-page`).
- Para #11: el panel lista las reservas en `pendiente_validacion` con su número; al rechazar, la reserva vuelve a `pendiente_pago`, se borra el número y se guarda el motivo, que la página de estado debe mostrar junto al formulario (el ingreso de este ítem ya acepta un nuevo número).
- Pedir al studio: la imagen del QR, el nombre de su billetera y un ejemplo real de número de operación para confirmar el formato.
