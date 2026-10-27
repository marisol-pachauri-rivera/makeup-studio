# Security Pass — Studio de Maquillaje (Sistema de Reservas)

Fecha: 2026-10-26

Alcance revisado:

- **Revisado:** producto (`PRD.md`), arquitectura (`TECH-DESIGN.md`, ADR 0001–0012), specs OpenSpec vigentes (consultadas por tema), código completo de `src/` (auth, `proxy.ts`, Server Actions públicas y del panel, `lib/reserva`, `lib/pago`, `lib/cancelacion`, `lib/reprogramacion`, `lib/reservas-panel`, `lib/disponibilidad`, esquema Drizzle), migraciones, `next.config.ts`, scripts, configuración de Playwright, manifiestos de dependencias (`npm audit --omit=dev`: 0 vulnerabilidades), archivos de entorno (solo nombres de variables; ningún valor se copió aquí) e historial de Git buscando secretos.
- **Revisado en forma parcial:** los tests (se leyó su estructura y la cobertura declarada, no cada caso) y las specs OpenSpec (no se leyó cada una a fondo).
- **Omitido por falta de material:** CI/CD (no hay pipelines en el repositorio), infraestructura como código y configuración de Vercel/Neon fuera del repo.

## Resumen ejecutivo

El proyecto está bien construido en lo que más importa: autenticación del panel con bcrypt, guardia doble (`requerirAdmin` en cada acción y página), validación con Zod antes de tocar la base, SQL parametrizado, lecturas públicas que no seleccionan datos personales, y las carreras críticas resueltas en la base. No encontré CRITICAL ni inyecciones, ni secretos en Git.

El riesgo real está en **disponibilidad y abuso de la lógica de negocio**, sin autenticación: cualquier persona anónima puede dejar sin horarios a todo el studio de forma indefinida (SEC-001), porque una reserva con un número de operación inventado nunca vence y no hay ningún límite de creación (SEC-002). En el otro extremo, cualquiera puede bloquear la cuenta de la administradora del panel de forma sostenida (SEC-003). Ambos riesgos están parcialmente reconocidos en el PRD y el ADR 0012, pero el primero es más grave de lo que ahí se describe. El resto son hallazgos de endurecimiento (LOW/INFO).

## Fortalezas de seguridad

- **Control de acceso del panel en profundidad:** `proxy.ts` es solo un filtro optimista y lo dice; la barrera real es `requerirAdmin()` como primera línea de las 14 Server Actions del panel y `requerirAdminOLogin()` en el layout y en cada página. Verificado que ninguna página ni acción del panel queda sin guardia. `buscarAdminDeSesion` revalida contra la base, así que dar de baja a una administradora corta el acceso sin esperar a que expire el JWT.
- **Login:** bcrypt costo 12, hash señuelo para igualar tiempos con usuario inexistente, mensaje único para usuario o contraseña incorrectos, límite 5/15 min persistido en Postgres, `callbackUrl` restringido a rutas `/admin` (sin open redirect), contraseña mínima de 12 y máximo de 72 bytes en el alta, sesión de 8 h.
- **Token de reserva:** UUID v4 generado por la base (`gen_random_uuid`), validado con `z.uuid()` antes de consultar, respuesta idéntica para token inválido y desconocido, `Cache-Control: private, no-store`, `noindex` y `Referrer-Policy: no-referrer` en `/reservas/*` y `/reservar`. `obtenerReservaPorToken` no selecciona teléfono, nombre, número de operación ni clave de idempotencia.
- **Integridad en la base:** restricción de exclusión contra solapamientos, `UNIQUE` en número de operación, `CHECK` de coherencia estado/número/cancelación, transiciones como un único `UPDATE` condicionado (la carrera la decide Postgres), reservas y líneas en una transacción.
- **Validación de entradas:** todo `FormData` pasa por Zod; `personas` acotado a 10; `leerPersonas` no lanza ante JSON roto; la ruta del QR rechaza `//` y `..`; el plazo de 24 h se decide con el reloj del servidor.
- **Inyección y XSS:** Drizzle parametriza todo; el único `sql.raw` (`schema.ts:20`) interpola constantes del código; no hay `dangerouslySetInnerHTML`, `eval` ni `new Function`.
- **Secretos:** `.env*` ignorado salvo `.env.example` (sin valores); la búsqueda en el historial de Git no encontró credenciales; el script de alta de admin recibe la contraseña por entorno y no la imprime.
- **Resiliencia de la UI:** errores inesperados muestran página amigable sin detalles técnicos (ADR 0009).

## Findings

### HIGH

**ID:** SEC-001
**Title:** Una reserva con número de operación inventado ocupa el horario para siempre; cualquier anónima puede dejar sin agenda al studio
**Severity:** HIGH
**Justificación de severidad:** el objetivo único del producto es que las clientas reserven sin intervención; este ataque lo anula por completo, no requiere cuenta, es trivial de automatizar y la única forma de revertirlo es cancelar a mano reserva por reserva desde el panel.
**Confidence:** HIGH
**Category:** Business-logic abuse / Denial of service
**Affected artifact:** Código, ADR 0003, PRD (casos borde)
**Location:** `src/lib/pago/ingreso.ts:42-59`, `src/lib/pago/esquemas.ts:13-21`, `src/lib/reserva/vencimiento.ts:25-35` (`condicionVencida`), `src/app/reservar/actions.ts`
**Description:** El vencimiento lazy solo aplica a reservas `pendiente_pago` **sin** número de operación (`isNull(reserva.numeroOperacion)`). Pero el servidor acepta como número de operación cualquier cadena de 4 a 30 caracteres alfanuméricos y guiones, sin verificarlo contra nada. En cuanto se informa uno, la reserva pasa a `pendiente_validacion`, deja de poder vencer y sigue ocupando el horario hasta que una administradora la rechace o la cancele. El PRD, el ADR 0003 y `TECH-DESIGN.md` documentan el abuso de reservas *sin pagar* (que sí vencen) pero no este camino, que lo esquiva.
**Evidence:** `condicionVencida` exige `estado = 'pendiente_pago' AND numero_operacion IS NULL AND motivo_rechazo IS NULL AND creada_en < límite`. `ingresarNumeroDeOperacion` hace `UPDATE ... SET numero_operacion = $n, estado = 'pendiente_validacion' WHERE token = $t AND estado = 'pendiente_pago' AND numero_operacion IS NULL`, con `numero` validado solo por forma. `reserva_linea` se mantiene `activa` en `pendiente_validacion`, y `consultarDisponibilidad` solo libera las vencidas.
**Attack scenario:** Un script (a) elige una maquilladora y un servicio, (b) llama a la Server Action `confirmarReserva` con un `clave` UUID nuevo y un nombre y teléfono falsos por cada horario ofrecido, hasta 30 días de horizonte, (c) con cada token devuelto llama a `ingresarNumero` con un número aleatorio de 8 dígitos. Cada reserva queda `pendiente_validacion` indefinidamente. Con una reserva grupal (hasta 10 líneas por llamada) el barrido es 10 veces más rápido. La disponibilidad pública queda vacía.
**Potential impact:** El studio no puede recibir reservas hasta limpiar manualmente; cada reserva falsa que una administradora cancele desde "pendiente de validación" la obliga a distinguirla de las legítimas. Riesgo secundario: el atacante también "consume" números de operación (únicos globalmente) y, si acierta uno real, la clienta legítima recibe "ese número ya fue usado".
**Existing mitigation:** El horizonte de 30 días y el máximo de 10 integrantes acotan el daño por llamada, no el total. La administradora puede rechazar o cancelar cada reserva.
**Recommended remediation:** Cualquier combinación de: (1) un plazo máximo (TTL) también para `pendiente_validacion`, tras el cual el horario se libera con el mismo mecanismo lazy y la clienta ve un aviso (el PRD ya identifica la falta de tiempo máximo de validación como riesgo principal); (2) un tope de reservas activas sin validar por teléfono (el PRD ya lo marca con `<!-- REVISAR -->`) y un límite de frecuencia por origen en `confirmarReserva` e `ingresarNumero`; (3) una acción de panel para cancelar en lote las reservas sospechosas.
**Suggested verification:** Test de integración: crear N reservas con números inventados y comprobar que, pasado el TTL, la disponibilidad pública vuelve a ofrecer los horarios y que una segunda clienta puede reservarlos. Test de abuso: la reserva N+1 del mismo teléfono es rechazada.
**Required change type:** DESIGN / ADR CHANGE

### MEDIUM

**ID:** SEC-002
**Title:** Las escrituras públicas no tienen límite de frecuencia ni de cantidad
**Severity:** MEDIUM
**Justificación de severidad:** reconocido por el propio equipo como riesgo abierto, pero sin mitigación alguna; deja de ser solo agenda: también agota recursos de plan gratuito.
**Confidence:** HIGH
**Category:** Resource exhaustion / Missing controls
**Affected artifact:** Código, PRD, TECH-DESIGN
**Location:** `src/app/reservar/actions.ts`, `src/app/reservas/[token]/actions.ts`, `src/app/reservas/[token]/reprogramar/actions.ts`; `PRD.md:106-107`; `TECH-DESIGN.md:181-183`
**Description:** `confirmarReserva`, `ingresarNumero`, `cancelarReserva` y `reprogramar` no exigen sesión (por diseño) y no aplican ningún límite por origen, por teléfono ni global. Cada llamada hace varias consultas a Neon y `confirmarReserva` inserta filas con texto libre (nombre hasta 100 caracteres, teléfono).
**Evidence:** Los tres archivos de acciones no tienen ninguna comprobación de frecuencia; no existe tabla ni lógica de límite fuera del login (`intento_login`). El PRD ya señala "el vencimiento no limita la cantidad de reservas sin pagar que una misma persona puede crear".
**Attack scenario:** Un bucle de `confirmarReserva` con claves nuevas llena la tabla `reserva`/`reserva_linea` del plan gratuito de Neon y consume sus cómputos y las invocaciones de Vercel Hobby; también multiplica el coste del barrido de SEC-001.
**Potential impact:** Degradación o caída de la base por límites de plan, facturación inesperada si se pasa a plan de pago, y la agenda del panel llena de ruido.
**Existing mitigation:** Zod acota tamaños de campo; el horizonte de disponibilidad es de 30 días; Vercel aplica límites de plataforma.
**Recommended remediation:** Límite de frecuencia por IP en el borde (por ejemplo, Vercel Firewall o WAF, sin cambiar la arquitectura) y un tope de reservas vivas por teléfono. Un CAPTCHA en `confirmarReserva` si el límite no basta.
**Suggested verification:** Prueba de carga acotada: 100 llamadas en un minuto desde un mismo origen devuelven 429 o un rechazo claro a partir del umbral.
**Required change type:** ACCEPT RISK (o DESIGN / ADR CHANGE si se decide mitigar)

**ID:** SEC-003
**Title:** Cualquiera puede mantener bloqueada la cuenta de la administradora de forma indefinida
**Severity:** MEDIUM
**Justificación de severidad:** el panel es el único punto humano del flujo (validar pagos); bloquearlo detiene todas las confirmaciones. El ADR 0012 acepta "15 minutos", pero el ataque es repetible sin costo, lo que lo vuelve indefinido.
**Confidence:** HIGH
**Category:** Denial of service / Authentication design
**Affected artifact:** ADR 0012, código
**Location:** `src/lib/auth/limite-intentos.ts:22-37`, `src/lib/auth/credenciales.ts:33`, `adrs/0012-limite-de-intentos-de-login.md` (Consecuencias)
**Description:** El bloqueo es por nombre de usuario, sin considerar el origen, y rechaza incluso la contraseña correcta. Los nombres de usuario se pueden adivinar (el panel es de pocas personas y el nombre se muestra en la cabecera del panel solo tras entrar, pero `maria`, `admin`, etc. son predecibles) y el bloqueo aplica incluso a usuarios inexistentes.
**Evidence:** `autorizar` llama a `consultarLimite` antes de verificar la contraseña y devuelve `bloqueado` con 5 fallos en 15 minutos. El ADR 0012 reconoce: "Alguien puede bloquear a propósito la cuenta de una administradora durante 15 minutos; se acepta".
**Attack scenario:** Un script envía 5 intentos fallidos con el usuario `admin` cada 15 minutos. La administradora real nunca llega a iniciar sesión (las sesiones ya abiertas siguen válidas hasta 8 h, pero tras eso quedan fuera).
**Potential impact:** Pagos sin validar, reservas que no se confirman, y el riesgo principal del PRD (demora de validación) provocado por un tercero.
**Existing mitigation:** Bloqueo temporal de 15 minutos; sesión de 8 h sobrevive al bloqueo; ADR 0012 lo acepta explícitamente.
**Recommended remediation:** Complementar el bloqueo por usuario con una señal de origen (IP o huella) para que el atacante pague el costo, o dar a la administradora un camino de entrada alterno (por ejemplo, bloqueo por par usuario+origen en vez de solo usuario). Documentar el procedimiento de desbloqueo manual (`delete from intento_login`).
**Suggested verification:** Test: 5 fallos desde un origen no bloquean a la administradora que entra desde otro origen con la contraseña correcta.
**Required change type:** ACCEPT RISK (o DESIGN / ADR CHANGE si se decide cambiar el ADR 0012)

### LOW

**ID:** SEC-004
**Title:** El límite de intentos de login no es atómico y el registro de fallos crece sin tope
**Severity:** LOW
**Confidence:** MEDIUM
**Category:** Race condition / Resource exhaustion
**Affected artifact:** Código, ADR 0012
**Location:** `src/lib/auth/credenciales.ts:33-44`, `src/lib/auth/limite-intentos.ts:22-41`
**Description:** (a) `consultarLimite` y `registrarFallo` son pasos separados: N solicitudes simultáneas leen "no bloqueado" antes de que alguna registre su fallo. El ADR 0012 afirma que el exceso es "de uno o dos intentos", pero con funciones serverless que escalan en paralelo y bcrypt de ~250 ms el exceso está acotado por la concurrencia, no por 1-2. (b) Cada fallo con un usuario distinto inserta una fila; la limpieza solo borra filas del mismo usuario cuando alguien vuelve a intentarlo, así que nombres aleatorios dejan filas para siempre.
**Evidence:** `autorizar`: `consultarLimite(...).bloqueado` → `verificarOSimular` → `registrarFallo`, sin bloqueo de fila ni transacción. `intentoLogin.usuario` no tiene `ON DELETE` ni limpieza global.
**Attack scenario:** (a) Una ráfaga de 100 intentos en paralelo permite 100 pruebas de contraseña antes de que se aplique el bloqueo; repetida cada 15 minutos. Con contraseñas de 12+ caracteres es impracticable, pero la política de longitud solo se exige en el alta por script, no en el login. (b) Millones de usuarios aleatorios inflan la tabla.
**Potential impact:** Fuerza bruta algo más rápida que lo documentado contra una contraseña débil; crecimiento innecesario de la base.
**Existing mitigation:** bcrypt costo 12 limita el ritmo por solicitud; el alta exige 12+ caracteres.
**Recommended remediation:** Registrar el intento antes de verificar la contraseña (y borrarlo si acierta), o contar con un `INSERT ... RETURNING` y comparar; y purgar `intento_login` vencidos de forma global durante cualquier consulta de límite.
**Suggested verification:** Test de concurrencia en `tests/modelo/intento-login.int.test.ts`: 20 intentos fallidos simultáneos con el mismo usuario permiten como máximo 5 verificaciones de contraseña.
**Required change type:** CODE FIX

**ID:** SEC-005
**Title:** Las acciones de las administradoras no dejan rastro de quién las hizo
**Severity:** LOW
**Confidence:** MEDIUM
**Category:** Insecure design / Missing audit
**Affected artifact:** Código, ADR 0005 (modelo de datos)
**Location:** `src/lib/reservas-panel/transiciones.ts:62` (`validadaEn`), `src/db/schema.ts:108-127`
**Description:** Validar un pago (el acto que confirma dinero recibido), rechazarlo, cancelar una reserva y marcar un reembolso como `realizado` solo registran un instante (`validadaEn`) y, en algunos casos, un motivo. Ninguna acción guarda qué administradora la ejecutó. `requerirAdmin()` devuelve el id de la administradora, pero se descarta.
**Evidence:** `reserva` no tiene `validadaPor`, `rechazadaPor`, ni existe tabla de eventos. `marcarReembolso` y `validarPago` llaman a `requerirAdmin()` sin usar su resultado.
**Attack scenario:** Con varias administradoras (el PRD habla de "alguien del studio"), una validación fraudulenta de un pago inexistente o un reembolso marcado como hecho sin hacerse no puede atribuirse a nadie.
**Potential impact:** Sin trazabilidad no hay disuasión ni investigación de fraude interno en el flujo que mueve dinero.
**Existing mitigation:** Las acciones exigen sesión; las transiciones son idempotentes; `validadaEn` registra cuándo.
**Recommended remediation:** Guardar el id de la administradora en cada transición (columnas o una tabla de eventos de solo anexado) con instante y estado anterior/nuevo.
**Suggested verification:** Test de integración: después de validar, rechazar, cancelar y marcar reembolso, la fila registra la administradora que lo hizo.
**Required change type:** DESIGN / ADR CHANGE

**ID:** SEC-006
**Title:** La cola de reembolsos mezcla pagos validados con números de operación nunca verificados
**Severity:** LOW
**Confidence:** MEDIUM
**Category:** Business-logic abuse
**Affected artifact:** Código, PRD, specs (`refund-tracking`)
**Location:** `src/lib/cancelacion/cancelar.ts:28-35,49`, `src/lib/cancelacion/reembolsos.ts:12-34`
**Description:** Cuando la clienta cancela una reserva en `pendiente_validacion`, el reembolso queda `pendiente` como si el pago fuera real, aunque el studio nunca lo verificó. La lista de reembolsos del panel no muestra si el pago llegó a validarse (`validadaEn`).
**Evidence:** `estadoReembolso = case when estado = 'pendiente_pago' then 'no_aplica' else 'pendiente' end`; el comentario del propio código dice que tratarlo así "es un supuesto a confirmar con el studio". `ReembolsoPendiente` no incluye `validadaEn`.
**Attack scenario:** Una persona informa un número inventado y cancela antes de que se revise; aparece en "reembolsos pendientes" con un monto. Una administradora que no coteje la billetera, o con prisa, puede marcarlo como realizado o iniciar una devolución de un pago que nunca existió.
**Potential impact:** Pérdida de dinero por reembolso indebido, por error humano más que por defecto técnico.
**Existing mitigation:** La lista muestra el número de operación para cotejar con la billetera; la acción es manual.
**Recommended remediation:** Mostrar en la lista de reembolsos si el pago fue validado y destacar los no validados, o exigir validación previa para generar un reembolso `pendiente`.
**Suggested verification:** Test: cancelar una reserva `pendiente_validacion` no genera un reembolso `pendiente` (o lo marca como "sin pago verificado").
**Required change type:** PRODUCT / REQUIREMENT CHANGE

**ID:** SEC-007
**Title:** Sin cabeceras de seguridad HTTP generales
**Severity:** LOW
**Confidence:** HIGH
**Category:** Security misconfiguration
**Affected artifact:** Código (configuración)
**Location:** `next.config.ts:8-28`
**Description:** `next.config.ts` solo define cabeceras para `/admin/*`, `/reservas/*` y `/reservar`. No hay `Content-Security-Policy`, `X-Content-Type-Options`, `frame-ancestors`/`X-Frame-Options` ni `Strict-Transport-Security`, ni `Referrer-Policy` en el resto de rutas. La imagen del QR puede venir de cualquier URL `https://` configurada en `QR_PAGO_URL`.
**Evidence:** Lectura de `next.config.ts`; no existe `middleware`/`proxy` que añada cabeceras fuera de `/admin`.
**Attack scenario:** Incrustar el sitio en un `iframe` ajeno (clickjacking sobre el asistente de reserva) o, si en el futuro apareciera un XSS, no habría una CSP que lo contuviera.
**Potential impact:** Bajo hoy: React escapa el contenido, no hay HTML sin sanear, y la cookie de sesión del panel usa `SameSite=Lax`, que impide usarla dentro de un iframe de otro sitio.
**Existing mitigation:** Escape de React, sin `dangerouslySetInnerHTML`, cookie `Lax`, `no-store` en el panel.
**Recommended remediation:** Añadir una cabecera global con CSP (`default-src 'self'`; `img-src` limitado al origen del QR), `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin`.
**Suggested verification:** Test (o chequeo con `curl -I`) de que `/`, `/reservar` y `/admin/login` devuelven esas cabeceras.
**Required change type:** CODE FIX

**ID:** SEC-008
**Title:** Datos personales de clientas sin aviso de privacidad, consentimiento ni política de retención
**Severity:** LOW
**Confidence:** LOW
**Category:** Privacy / Missing requirement
**Affected artifact:** PRD, código
**Location:** `src/lib/reserva/esquemas.ts:10-28`, `src/db/schema.ts:108-127`; `PRD.md` (sin mención)
**Description:** La reserva guarda nombre y teléfono de la clienta y los nombres de cada integrante de un grupo (que pueden ser terceras personas, a veces menores), sin aviso de privacidad ni consentimiento en el formulario, y sin plazo de conservación ni borrado. Una búsqueda en `src/`, `PRD.md` y los ADR no encontró ningún texto de privacidad.
**Evidence:** Búsqueda de "privacidad", "datos personales", "consentimiento" y "29733" sin coincidencias fuera de tests de lecturas.
**Attack scenario:** No es un ataque técnico; es exposición legal y de confianza si una clienta pide acceso o borrado.
**Potential impact:** Incumplimiento potencial de la normativa de protección de datos del país del studio. **Confianza baja** porque la jurisdicción no figura en el PRD; el uso de billeteras tipo Yape/Plin sugiere Perú (Ley 29733), pero hay que confirmarlo con el studio.
**Existing mitigation:** Lectura pública sin datos de contacto, acceso al panel autenticado, token no adivinable.
**Recommended remediation:** Confirmar la jurisdicción; añadir aviso y casilla de consentimiento en el paso de confirmación; definir cuánto tiempo se conservan las reservas canceladas o pasadas y cómo se borran.
**Suggested verification:** Criterio de aceptación: el paso de confirmación muestra el aviso y no permite confirmar sin aceptarlo.
**Required change type:** PRODUCT / REQUIREMENT CHANGE

### INFO

**ID:** SEC-009
**Title:** Credenciales de una segunda base (probablemente producción) guardadas en un `.bak` local y E2E sin guardia de entorno
**Severity:** INFO
**Confidence:** MEDIUM
**Category:** Secrets handling / Process
**Affected artifact:** Entorno de desarrollo, configuración de pruebas
**Location:** `.env.local.production.bak`, `.env.local`, `playwright.config.ts`
**Description:** El `.bak` no está en Git (ignorado por `.env*` y ausente del historial, verificado) pero contiene `DATABASE_URL` y `DATABASE_URL_UNPOOLED` de un endpoint de Neon distinto del de `.env.local`. La suite Playwright arranca `npm run dev` con lo que diga `.env.local` y crea datos reales (maquilladoras, reservas); a diferencia de los tests de integración (`tests/aislamiento.test.ts`), no verifica que la base sea desechable. Además, `trace: 'retain-on-failure'` puede dejar en `playwright-report/` la contraseña E2E tecleada.
**Evidence:** Comparación de huellas de los valores (sin imprimirlos) y de los nombres de host de Neon.
**Attack scenario:** Un cambio accidental de `.env.local` hacia producción ejecutaría las pruebas E2E contra datos reales; o una copia de la carpeta del proyecto filtraría el `.bak`.
**Potential impact:** Contaminación de datos de producción o filtración de credenciales por copia del directorio.
**Existing mitigation:** Archivos ignorados por Git, rama `dev` en `.env.local`.
**Recommended remediation:** Mover el `.bak` fuera del árbol del proyecto o a un gestor de secretos; rotar su contraseña si estuvo en carpetas sincronizadas; añadir al `global-setup` de Playwright una comprobación equivalente a `verificarAislamiento`.
**Suggested verification:** Test que falle si `DATABASE_URL` apunta al endpoint de producción al correr Playwright.
**Required change type:** PROCESS / HARNESS CHANGE

**ID:** SEC-010
**Title:** Auth.js v5 en versión beta en la ruta de autenticación
**Severity:** INFO
**Confidence:** HIGH
**Category:** Dependency / supply-chain risk
**Affected artifact:** `package.json`
**Location:** `package.json` (`next-auth: 5.0.0-beta.32`)
**Description:** La autenticación del panel depende de una versión beta fijada exactamente. `npm audit --omit=dev` no reporta vulnerabilidades hoy; el riesgo es de mantenimiento (cambios incompatibles o parches de seguridad que lleguen a la rama estable primero). Las demás dependencias de ejecución son las esperables para el stack (`cn` es el paquete oficial del proyecto shadcn).
**Evidence:** `package.json`, salida de `npm audit`.
**Attack scenario:** No aplica hoy.
**Potential impact:** Parches de seguridad tardíos o rotura al actualizar.
**Existing mitigation:** Versión fijada exacta; lockfile con integridad.
**Recommended remediation:** Seguir los avisos de seguridad de Auth.js, pasar a la versión estable de v5 cuando exista, y correr `npm audit` en CI.
**Suggested verification:** Un paso de CI con `npm audit --omit=dev` que falle ante severidad alta.
**Required change type:** PROCESS / HARNESS CHANGE

## Prioridad

1. **SEC-001** primero: es el único hallazgo que anula el propósito del producto sin credenciales. Su solución de fondo (TTL en `pendiente_validacion`) es una decisión de diseño que modifica el ADR 0003.
2. **SEC-002** junto con SEC-001: un límite de frecuencia por origen y un tope por teléfono mitigan ambos; sin él, un TTL solo obliga al atacante a repetir.
3. **SEC-003** y **SEC-004** juntos, porque comparten el mismo código del login: decidir si el bloqueo sigue siendo solo por usuario y, a la vez, hacerlo atómico.
4. **SEC-005** y **SEC-006** antes de tener varias administradoras o de procesar el primer reembolso real; ambos afectan el control del dinero.
5. **SEC-007** y **SEC-008** son endurecimiento y cumplimiento; SEC-008 conviene resolverlo antes de salir a producción con clientas reales.
6. **SEC-009** y **SEC-010** son de proceso y se resuelven sin tocar la aplicación.

## Gobernanza / Decisión requerida

Estos hallazgos no se pueden resolver sin una decisión humana; este pase no cambió nada de ellos:

- **SEC-001 — DESIGN / ADR CHANGE:** exige decidir si `pendiente_validacion` debe tener un plazo máximo (hoy el PRD lo deja deliberadamente sin tiempo máximo) y qué pasa con una clienta que sí pagó cuando su reserva se libera. Modifica el ADR 0003 y el PRD.
- **SEC-002 — ACCEPT RISK:** el PRD y `TECH-DESIGN.md` ya lo listan como riesgo abierto; aceptarlo o mitigarlo es una decisión del dueño del producto, y mitigarlo en el borde de Vercel puede tener coste de plan.
- **SEC-003 — ACCEPT RISK:** el ADR 0012 ya lo aceptó para 15 minutos; hay que confirmar que se acepta también como ataque sostenido, o reabrir el ADR.
- **SEC-005 — DESIGN / ADR CHANGE:** agrega columnas o una tabla al modelo del ADR 0005.
- **SEC-006 — PRODUCT / REQUIREMENT CHANGE:** el propio código marca el tratamiento del reembolso en `pendiente_validacion` como un supuesto pendiente de confirmar con el studio.
- **SEC-008 — PRODUCT / REQUIREMENT CHANGE:** requiere confirmar la jurisdicción y aprobar el texto y la política de retención.

SEC-004 es CODE FIX; SEC-007, CODE FIX; SEC-009 y SEC-010, PROCESS / HARNESS CHANGE: no requieren decisión de producto o arquitectura.
