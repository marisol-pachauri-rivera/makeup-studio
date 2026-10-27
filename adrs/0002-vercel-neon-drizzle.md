# ADR 0002: Despliegue en Vercel free tier, persistencia en Neon Postgres con Drizzle

## Estado

Aceptado

## Contexto

El usuario fijó dos restricciones obligatorias: el proyecto debe poder desplegarse en Vercel free
tier (plan Hobby) y la persistencia debe ser PostgreSQL en el servicio Neon. El código corre como
funciones serverless sin proceso persistente, por lo que las conexiones a la base deben ser
compatibles con ese modelo. El PRD exige consistencia fuerte en las reservas: dos clientas no
pueden tomar el mismo horario con la misma maquilladora, lo que requiere transacciones y
restricciones a nivel de base de datos.

## Decisión

- Despliegue en Vercel (plan Hobby/free tier).
- Base de datos PostgreSQL en Neon.
- Acceso a datos con Drizzle ORM sobre el driver serverless de Neon (`@neondatabase/serverless`),
  con migraciones versionadas en SQL.

Las dos primeras son restricciones impuestas por el usuario; la tercera fue elegida por el
usuario entre las alternativas listadas.

## Alternativas consideradas

- **Prisma ORM con adapter de Neon** — mejor DX y migraciones maduras, pero más pesado en cold
  start y con restricciones avanzadas de Postgres (ej. `EXCLUDE`) que requieren SQL manual.
- **SQL directo con Kysely** — máximo control y mínimo peso, pero más código a mano y menor
  productividad para un equipo de una persona.
- **Otros hosts o bases de datos** — no evaluados: descartados por la restricción obligatoria
  del usuario.

## Consecuencias

- Costo de infraestructura inicial cero y despliegue simple desde el repo.
- Drizzle permite expresar en migraciones SQL restricciones de Postgres que previenen dobles
  reservas a nivel de base de datos, no solo en la aplicación.
- Neon free tiene límites de almacenamiento y de cómputo, y la base se suspende por inactividad,
  lo que agrega latencia en la primera consulta tras un periodo sin tráfico.
- Vercel Hobby limita la duración de las funciones y la frecuencia del cron (mínimo una vez al
  día), y sus términos lo destinan a uso personal no comercial; el studio es un negocio, por lo
  que migrar a un plan de pago puede ser necesario para producción.
- Drizzle tiene un ecosistema más joven que Prisma y menos recursos de terceros.
