---
title: "Studio de Maquillaje - Sistema de Reservas"
---

<!-- REVISAR: confirmar el nombre real del producto/studio para reemplazar el título placeholder -->

# PRD: Studio de Maquillaje - Sistema de Reservas

## Problema

El studio de maquillaje pierde tiempo gestionando reservas manualmente por WhatsApp, y esa
demora en responder retrasa (o hace perder) reservas de clientas que quieren agendar rápido.
Hoy todo el proceso de reserva se maneja por chat, sin ningún sistema de agenda estructurado.

## Usuario objetivo

Clientas que reservan servicios de maquillaje para sí mismas o para un grupo (ej. elencos de
danza, eventos grupales), eligiendo directamente a la maquilladora de su preferencia, en
momentos variados (no hay un patrón horario fijo de reserva).

Del lado operativo, el studio cuenta con varias maquilladoras cuya disponibilidad hay que
reflejar en la agenda, y alguien del studio necesita validar manualmente los pagos entrantes.

## Objetivo / resultado esperado

La clienta completa de punta a punta el flujo de reserva sin necesidad de escribirle al
studio por WhatsApp:

1. Elige el servicio
2. Elige la maquilladora
3. Ve los horarios disponibles
4. Confirma la reserva (individual o grupal)
5. Paga: ve el QR de la billetera electrónica e ingresa el número de operación del pago
6. Recibe confirmación una vez que el studio valida el pago

El éxito se ve en que este flujo se complete solo, sin intervención manual del studio durante
el proceso (la validación de pago es la única intervención humana esperada).

## Alcance (qué sí incluye esta versión)

- Catálogo de servicios de maquillaje con precios, visible públicamente
- Selección de maquilladora por parte de la clienta, con disponibilidad de horarios visible
- Reserva individual y reserva grupal (mismo flujo, extendido a varias personas del grupo;
  requiere tener definidas todas las personas del grupo antes de poder reservar)
- Pago online manual: se muestra el QR de la billetera electrónica y la clienta ingresa el
  número de operación del pago (texto, sin subida de archivos)
- Validación manual del pago por parte de alguien del studio antes de confirmar la reserva: el
  studio cruza el número de operación con el movimiento en su propia billetera
- Panel administrativo para el studio: ver reservas entrantes, validar pagos, gestionar la
  agenda por maquilladora
- Cancelación y reprogramación de turnos por parte de la clienta desde la plataforma, con un
  mínimo de 24 horas de anticipación al turno (pasado ese plazo la plataforma no lo permite)
  - Cancelación → reembolso del pago ya validado
  - Reprogramación → se puede cambiar horario y maquilladora; se mantiene el número de
    operación del pago ya validado, no requiere nuevo pago
- Notificación de confirmación a la clienta una vez validado el pago
- Vencimiento automático de reservas sin pago: una reserva en "pendiente de pago" que nunca
  recibió número de operación y tiene más de 20 minutos se libera sola cuando otra clienta quiere ese
  mismo horario (ver casos borde). No hay un proceso programado: la liberación ocurre al intentar
  reservar.
<!-- REVISAR: confirmar con el studio que 20 minutos alcanza para que la clienta pague con su
billetera e ingrese el número de operación; un plazo corto aumenta los casos de pago hecho con
reserva vencida (reembolso manual) -->


## No alcance (qué explícitamente no incluye esta versión)

- No incluye pasarela de pago integrada (cobro automático con tarjeta); el pago es únicamente
  manual vía QR de billetera electrónica + número de operación + validación humana
- No incluye almacenamiento de archivos: ni capturas de comprobante de pago ni fotos
- No incluye sección de portafolio con fotos de trabajos anteriores (fuera de esta versión)
- No incluye asignación automática de maquilladora; si la maquilladora elegida no está
  disponible, la clienta decide manualmente si elige otra o espera
- No incluye sistema de reseñas o calificaciones de maquilladoras
- No incluye recordatorios de turno por WhatsApp (ni otro canal de recordatorio)
- No incluye bloqueo temporal de horarios previo a la reserva (reservar "en espera" mientras se
  elige): el horario solo se ocupa al crear la reserva

## Criterios de éxito

- Al menos el 70% de las reservas confirmadas se completan sin que la clienta necesite enviar
  ningún mensaje de WhatsApp al studio, medido durante el primer trimestre de uso.
- Anti-métrica: el volumen de visitas a la web no se considera éxito por sí solo si no se
  traduce en reservas completadas.

## Casos borde a contemplar

- Número de operación ya usado en otra reserva → se rechaza; cada número de operación es único
  en el sistema.
- Número de operación ingresado no corresponde a ningún pago en la billetera del studio, o
  está mal escrito → la reserva queda "pendiente de validación" hasta que el studio la revise.
- La clienta crea la reserva pero no ingresa número de operación → la reserva queda
  "pendiente de pago" y ocupa el horario. Pasados 20 minutos desde su creación, el horario se
  considera disponible para otras clientas y la reserva se cancela por vencimiento en cuanto otra
  clienta intenta tomarlo; mientras nadie lo tome, la clienta original aún puede ingresar su
  número. El studio también puede cancelarla manualmente desde el panel en cualquier momento. Si la
  clienta intenta pagar cuando su reserva ya venció y el horario fue tomado, se le informa que
  venció y debe elegir otro horario. La pantalla de pago le muestra el plazo de 20 minutos.
- Una reserva que el studio rechazó por el pago (vuelve a "pendiente de pago" para que la
  clienta corrija el número) no vence automáticamente, porque es probable que la clienta ya haya
  pagado; la resuelve el studio.
- Dos clientas intentan reservar el mismo horario con la misma maquilladora casi al mismo
  tiempo → la primera reserva en crearse (aun sin pagar) ocupa el horario; la segunda recibe
  aviso de que ya no está disponible y elige otro, salvo que la primera sea una reserva vencida
  (ver arriba), en cuyo caso se libera y la segunda queda con el horario.
  <!-- REVISAR: el vencimiento no limita la cantidad de reservas sin pagar que una misma persona
  puede crear; evaluar un tope por teléfono -->

- Reserva grupal con integrantes aún no definidos → no se permite completar la reserva hasta
  tener definidas todas las personas del grupo a maquillar.
- Demora del studio en validar el pago → no hay un tiempo máximo definido de validación.
  <!-- REVISAR: evaluar si conviene fijar un tiempo máximo de validación más adelante, dado
  que es también el riesgo principal identificado en la sección de riesgos -->

## Supuestos y riesgos abiertos

Supuestos:
- Se asume que la clienta sabe usar su billetera electrónica (generar/escanear QR) y ubicar el
  número de operación del pago.
<!-- REVISAR: sin comprobante adjunto, el sistema no guarda evidencia del pago; la validación
depende de que el studio coteje el número de operación contra su billetera. (Resuelto: el
número de operación es único en el sistema.) -->
<!-- REVISAR: el PRD cambió en esta sesión (comprobante → número de operación; portafolio
removido). Confirmar con el studio que este mecanismo de validación les resulta suficiente -->

<!-- REVISAR: se asume que el studio dispondrá de al menos una persona con disponibilidad
regular para validar pagos entrantes; si nadie está asignado a esta tarea, el flujo completo
se traba -->

Riesgos:
- Que el studio no valide los pagos a tiempo y las clientas se frustren, generando quejas y
  afectando la confianza en la plataforma. Este es el riesgo principal identificado — se
  relaciona directamente con no tener un tiempo máximo de validación definido (ver casos
  borde).
