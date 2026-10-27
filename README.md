# Studio de Maquillaje - Sistema de Reservas

Sistema de reservas online para un studio de maquillaje. Contexto en `PRD.md`, diseño en
`TECH-DESIGN.md` y decisiones en `adrs/`.

## Requisitos

- Node.js 22 y npm.
- Docker en ejecución, solo para los tests con base de datos (ADR 0011).
- Una base PostgreSQL en Neon para correr la app (ADR 0002).

## Configuración

Copiá `.env.example` a `.env.local` y completá `DATABASE_URL` con la cadena de conexión de Neon y
`AUTH_SECRET` con un secreto aleatorio (`npx auth secret`). Ese archivo no se versiona. Sin
`AUTH_SECRET` el panel no inicia sesión y falla con un mensaje que lo indica. Al correr
`npm run start` fuera de Vercel hace falta además `AUTH_TRUST_HOST=true`.

## Panel del studio

El panel vive en `/admin` y exige iniciar sesión (ADR 0007). No hay registro público: las
administradoras se crean por línea de comandos, con la contraseña por entorno para que no quede en
Git ni en el historial del shell:

```bash
ADMIN_USUARIO=maria ADMIN_PASSWORD='una clave de al menos 12 caracteres' npm run db:seed-admin
```

El script guarda solo el hash, no imprime la contraseña y no modifica a una administradora que ya
existe. Tras 5 intentos fallidos con un usuario, el login lo bloquea 15 minutos (ADR 0012). La
sesión dura 8 horas.

- **Secciones:** `/admin/servicios` y `/admin/maquilladoras` permiten crear, editar, desactivar y
  reactivar. No se borra nada: la única baja es desactivar, y las reservas ya hechas conservan su
  historial y sus precios.
- **Reservas:** `/admin/reservas` lista las reservas (las pendientes de validación primero, la más antigua
  arriba) y cada detalle permite validar el pago, rechazarlo con un motivo (la reserva vuelve a pendiente de
  pago, conserva su horario y la clienta ve el motivo en su página) o cancelarla con confirmación.
- **Reembolsos:** `/admin/reembolsos` lista las reservas canceladas con un pago por devolver (monto y número
  de operación para buscarlo en la billetera). El studio devuelve el dinero por su cuenta y lo marca
  "realizado"; el sistema no registra quién ni cuándo.
- **Agenda del día:** `/admin/agenda` muestra, de solo lectura, qué turnos y bloqueos tiene cada
  maquilladora un día (hoy por defecto, hora de Lima; otra fecha con `?fecha=YYYY-MM-DD`, la franja de la
  semana o el selector). Una reserva sin pago pasados los 20 minutos sigue apareciendo con la marca
  "Plazo vencido". No es "Horario y bloqueos", que es donde se cargan.
- **Horario y bloqueos de una maquilladora:** desde el botón "Agenda" (`/admin/maquilladoras/<id>/agenda`) se carga su
  horario semanal (varios tramos por día, sin solaparse) y sus bloqueos de agenda. Las horas se ingresan
  y se muestran en hora de Lima (`ZONA_STUDIO` en `src/lib/agenda/zona-horaria.ts`). Aquí quitar sí
  borra el tramo o el bloqueo, y un bloqueo no cancela las reservas que ya existan en ese rango.
- **Olvidó la contraseña, o hay que dar de baja a alguien:** no hay recuperación automática (no se
  envían emails). Borrá su fila de `usuario_admin` en la base y volvé a correr el seed; borrarla
  también corta su sesión abierta.
- **Quedó bloqueada por intentos fallidos:** se libera sola a los 15 minutos. Para liberarla ya,
  borrá sus filas de `intento_login`.
- **Nueva Server Action del panel:** debe empezar con `await requerirAdmin()` (de
  `@/lib/auth/sesion`) y vivir en un `actions.ts` bajo `src/app/admin/`; una prueba lo comprueba.

## Sitio público

No pide cuenta. La portada (`/`) lista los servicios activos con precio y duración, y cada uno lleva a
`/servicios/<id>/disponibilidad`, donde la clienta elige una maquilladora activa (el sistema nunca elige
por ella), después un día y ve sus horarios libres. La selección vive en la URL
(`?maquilladora=<id>&fecha=YYYY-MM-DD`).

- **Cómo se calculan:** inicios cada 30 minutos desde el comienzo de cada tramo del horario de trabajo, solo
  si el servicio completo cabe; se descuentan bloqueos y líneas de reserva activas (también las de una
  reserva pendiente de pago, salvo las vencidas, ver "Reserva"), y lo que ya pasó. Se ofrecen los próximos
  30 días, en hora de Lima. Los valores están en `src/lib/disponibilidad/constantes.ts` y
  `src/lib/agenda/zona-horaria.ts`.

## Reserva

Elegir un horario guarda la selección en `sessionStorage` (ADR 0008) y lleva a `/reservar`: resumen,
nombre y teléfono, y un botón de confirmar. Nada se escribe en la base hasta confirmar.

- **Al confirmar** una única Server Action (`src/app/reservar/actions.ts`) valida la entrada, revalida la
  disponibilidad y crea la reserva (`pendiente_pago`, monto igual al precio del servicio) con su línea en una
  transacción. Si otra clienta tomó el horario, avisa "ya no está disponible" y conserva lo escrito.
- **Doble clic o reenvío:** cada intento lleva una clave de idempotencia (`reserva.clave_idempotencia`);
  reenviarla devuelve la misma reserva en lugar de crear otra.
- **Reserva grupal:** el interruptor "Reservar para un grupo" de `/reservar` arma una lista de 2 a 10
  integrantes, cada una con su nombre, servicio, maquilladora y horario (se elige con el catálogo y la
  disponibilidad de siempre). Se crea **una** reserva con N líneas, un token y un monto total (suma exacta
  de los precios), todo o nada: si una línea choca no se guarda ninguna y se marca a las afectadas, sin
  perder al resto. El servidor también detecta dos integrantes con la misma maquilladora a la vez.
- **Vencimiento (ADR 0003):** una reserva en `pendiente_pago`, sin número de operación ni motivo de rechazo,
  deja de ocupar el horario a los 20 minutos (`PLAZO_VENCIMIENTO_MINUTOS` en `src/lib/reserva/vencimiento.ts`).
  No hay cron: la disponibilidad pública ya la muestra libre y se cancela (motivo `vencida`) cuando otra
  clienta toma ese horario, en la misma transacción que crea la nueva reserva. Las devueltas por un rechazo
  de pago no vencen, y si la clienta original ingresa su número justo antes, conserva su reserva. Hasta que
  alguien tome el horario, una vencida sigue figurando `pendiente_pago`. No hay tope de reservas sin pagar.
- **Página de estado:** `/reservas/<token>` muestra el estado, el turno y el monto, sin teléfono. El enlace
  es la única credencial: no se indexa, no se cachea y no se envía como referencia.
- **Cancelar desde el enlace:** la clienta puede cancelar la reserva completa (también un grupo) con 24 horas
  o más de anticipación al primer turno; la regla la decide el servidor y la pantalla solo la anticipa. Pasado
  el plazo el botón se deshabilita y se le pide escribir al studio. El horario se libera al instante. El
  reembolso queda `pendiente` si hubo pago informado (confirmado o en validación) y `no_aplica` si no; la
  página explica el monto y que lo gestiona el studio, sin prometer plazos (se marca desde `/admin/reembolsos`).
- **Pago por QR:** una reserva `pendiente_pago` muestra en esa página el QR de la billetera del studio, el
  monto exacto, el plazo de 20 minutos (hasta qué hora de Lima) y un campo para el número de operación,
  sin subir archivos. El QR sale de las variables `QR_PAGO_URL` (una URL `https://` o una ruta de `public/`,
  por ejemplo `/qr-pago.png`) y `BILLETERA_NOMBRE`; **sin un QR válido la página no ofrece el campo**, a
  propósito, y no hay un QR de ejemplo. El número se guarda en mayúsculas (4 a 30 caracteres: letras,
  números y guiones, sin espacios) y es único en todo el sistema. Al informarlo la reserva pasa a
  `pendiente_validacion` para que el studio la revise. Si la reserva ya fue cancelada por vencimiento se
  explica y se ofrece elegir otro horario; si solo pasó el plazo y nadie tomó el horario, el número se acepta.
- **Migración:** el ítem agregó la columna `clave_idempotencia` (`drizzle/0004_reserva_clave_idempotencia.sql`).
  Hay que correr `npm run db:migrate` contra Neon **antes** de desplegar el código nuevo.

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # entorno de desarrollo
npm run build        # build de producción
npm run start        # correr el build de producción
npm run lint         # linter
npm run test         # suite completa (levanta un Postgres en Docker)
npm run test:unit    # solo tests sin base de datos
npm run db:generate  # generar migraciones con Drizzle
npm run db:migrate   # aplicar migraciones a DATABASE_URL
npm run db:seed-admin  # crear una administradora del panel (ADMIN_USUARIO y ADMIN_PASSWORD)
```

## Tests

`npm run test` levanta un contenedor `postgres:17` con Testcontainers, aplica las migraciones de
`drizzle/` y lo destruye al terminar. Las pruebas nunca usan la base de `DATABASE_URL`: si la URL de
pruebas coincidiera con ella, o apuntara a Neon, la corrida se aborta. Si Docker no está disponible,
la suite falla con un mensaje que lo indica; `npm run test:unit` corre sin él.
