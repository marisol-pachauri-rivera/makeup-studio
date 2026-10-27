# CLAUDE.md

## Contexto del proyecto

**Qué es:** sistema de reservas online para un studio de maquillaje con varias
maquilladoras. Reemplaza la gestión manual de turnos por WhatsApp por un flujo de
autogestión: la clienta elige servicio, maquilladora y horario, paga de forma manual
(QR de billetera electrónica + número de operación) y el studio valida el pago antes
de confirmar la reserva.

**Qué problema resuelve:** el studio pierde tiempo gestionando reservas por WhatsApp, y
esa demora en responder retrasa o hace perder reservas. El objetivo es que la clienta
complete todo el flujo de reserva (incluida la reserva grupal, ej. para un elenco de
danza) sin necesidad de escribirle al studio.

**Arquitectura general (definida en `TECH-DESIGN.md` y `adrs/`):**
- Monolito Next.js + TypeScript (ADR 0001): una sola app con sitio público y panel admin.
- Sitio público de reserva (catálogo, disponibilidad, flujo de reserva y pago, página de
  estado de la reserva con enlace único) y panel administrativo para el studio (validar
  pagos, gestionar agenda por maquilladora, ver reservas).
- **Restricción obligatoria:** debe poder desplegarse en Vercel free tier, con PostgreSQL en
  Neon como única persistencia (ADR 0002). Acceso a datos con Drizzle ORM.
- Lecturas con Server Components y escrituras con Server Actions, validadas con Zod
  (ADR 0006). Sin endpoints REST propios.
- Auth del panel con Auth.js (usuario y contraseña, ADR 0007). Las clientas no tienen cuenta.
- UI con Tailwind CSS y shadcn/ui (ADR 0010).
- Sin cron, sin almacenamiento de archivos y sin mensajería saliente (ni WhatsApp ni email):
  no están en el alcance (ADR 0003 y ADR 0004).
- Los turnos no se pueden solapar: la restricción vive en Postgres, no solo en la app
  (ADR 0003 y ADR 0005).

Ver `TECH-DESIGN.md` para componentes, modelo de datos y criterios de aceptación, y `adrs/`
para la justificación de cada decisión.

**Contexto de negocio:** el studio ya opera y tiene clientas; el negocio no es nuevo, lo
que se digitaliza es la gestión de la agenda. Hay más de una maquilladora, y la clienta
elige directamente a cuál quiere (no hay asignación automática). El pago es manual en
esta versión — no hay pasarela de pago integrada.

Ver `PRD.md` para el detalle completo de alcance, no-alcance, criterios de éxito, casos
borde y supuestos/riesgos.

## Reglas duras

- **Leer `PRD.md` completo antes de planificar o generar código.** Ninguna tarea de
  diseño técnico o implementación arranca sin haber releído el PRD vigente primero,
  incluso si ya se leyó en una sesión anterior.
- **Leer también `TECH-DESIGN.md` y los ADRs relevantes en `adrs/`** antes de implementar.
  Una decisión que contradiga un ADR se consulta con el usuario y se documenta en un ADR
  nuevo o actualizado, no se cambia en silencio.
- **Si una solicitud queda fuera del alcance definido en `PRD.md` (sección "No alcance"
  o algo no contemplado en "Alcance"), el agente debe detenerse** y consultar con el
  usuario antes de implementar. No asumir que "es una mejora chica" o "no hace daño" —
  cualquier feature fuera de alcance se confirma explícitamente antes de tocar código.
- Si el PRD tiene una sección marcada `<!-- REVISAR: ... -->` que es relevante para la
  tarea en curso, señalarlo al usuario antes de avanzar en vez de asumir una respuesta.

## Comandos del entorno

<!-- REVISAR: el proyecto todavía no está inicializado (no hay package.json ni código).
Estos comandos son los esperados una vez scaffoldeado con Next.js + TypeScript —
actualizar esta sección apenas se genere el proyecto real. -->

```bash
npm install          # instalar dependencias
npm run dev           # levantar entorno de desarrollo
npm run build         # build de producción
npm run start          # correr build de producción
npm run lint           # linter
npm run test            # suite completa con Vitest; requiere Docker (Postgres real, ADR 0011)
npm run test:unit       # solo tests sin base de datos (no requiere Docker)
npm run db:generate     # generar migraciones SQL con Drizzle a partir del esquema
npm run db:migrate      # aplicar migraciones a la base de DATABASE_URL
npm run db:seed-admin   # crear una administradora del panel (ADMIN_USUARIO y ADMIN_PASSWORD por entorno)
```

### Migraciones

El esquema vive en `src/db/schema.ts`; `npm run db:generate` produce las migraciones en `drizzle/`.
Lo que Drizzle no puede expresar (como la restricción de exclusión de `reserva_linea`, ADR 0003) va
en una migración SQL escrita a mano:

```bash
npx drizzle-kit generate --custom --name=descripcion_corta   # crea un .sql vacío para editar
```

Las migraciones solo avanzan: no hay migraciones inversas. El snapshot de Drizzle no conoce lo
escrito a mano, así que cualquier migración que reconstruya una tabla con restricciones manuales
(hoy, `reserva_linea` y su exclusión `reserva_linea_sin_solapamiento`) debe repetirlas.
