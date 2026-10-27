# ADR 0001: Monolito Next.js como única aplicación

## Estado

Aceptado. Actualizado: se quitaron el portafolio, las tareas programadas (Vercel Cron), los
recordatorios y los route handlers, que salieron del alcance (ADR 0003 y ADR 0006).

## Contexto

El PRD define dos superficies: el sitio público de reserva (catálogo, flujo de reserva y pago,
página de estado de la reserva) y el panel administrativo del studio (validar pagos, gestionar
agenda por maquilladora, ver reservas). No hay tareas que dependan de algo distinto de una visita
web: el vencimiento de reservas sin pago es lazy, ocurre al intentar reservar (ADR 0003), y no hay
mensajería saliente (ADR 0004). El equipo es de una persona y el despliegue debe poder hacerse en
Vercel free tier (ver ADR 0002). `CLAUDE.md` ya plantea una app Next.js full-stack como
arquitectura general.

## Decisión

Una única aplicación Next.js (TypeScript) en un solo repo y un solo despliegue, que aloja el sitio
público y el panel admin (en rutas separadas y protegidas). La capa de servidor usa Server
Components para lecturas y Server Actions para escrituras (ADR 0006); no hay endpoints REST propios
ni tareas programadas.

## Alternativas consideradas

- **Dos apps Next.js separadas (pública y admin) con DB y dominio compartidos** — viable y aísla
  la superficie del panel, pero duplica configuración y despliegues y exige monorepo o paquete
  compartido; desproporcionado para un equipo de una persona.
- **Next.js más un worker externo gratuito (ej. GitHub Actions programado)** — innecesario hoy: ya
  no hay tareas programadas. Se reevaluaría si apareciera una necesidad de jobs frecuentes.

## Consecuencias

- Un solo repo, un solo deploy y un solo conjunto de variables de entorno; mínima carga
  operativa.
- Sitio público y panel se despliegan juntos: un cambio en una superficie redespliega todo.
- Sin cron, el despliegue en Vercel Hobby no depende de sus límites de frecuencia de tareas
  programadas.
