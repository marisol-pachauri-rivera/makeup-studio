# ADR 0011: Vitest con PostgreSQL real en contenedor como framework de testing

## Estado

Aceptado

## Contexto

`CLAUDE.md` y `TECH-DESIGN.md` dejaban el framework de testing sin definir. El negocio depende de
garantías propias de Postgres: la restricción de exclusión que impide solapar turnos (ADR 0003 y
ADR 0005), `UNIQUE` en el número de operación y las transacciones de reserva (ADR 0009). Probarlas
contra un sustituto del motor daría falsa confianza. En producción el acceso a datos usa el driver
serverless de Neon sobre WebSocket (ADR 0002), que no se conecta a un Postgres plano. El equipo es
de una persona y la máquina de desarrollo dispone de Docker.

## Decisión

- **Vitest** como runner de tests unitarios, de integración y de componentes.
- **PostgreSQL real en un contenedor Docker**, levantado una vez por corrida desde el `globalSetup`
  de Vitest con Testcontainers y destruido al terminar. Se usa la imagen `postgres:17`, versión
  mayor a confirmar contra el proyecto Neon real antes del primer despliegue.
- **Driver `node-postgres` en las pruebas** mediante `drizzle-orm/node-postgres`, y
  `drizzle-orm/neon-serverless` en producción. El código de negocio depende del tipo común de
  Drizzle para Postgres, y el código específico de cada driver queda dentro de `src/db/`.
- **Aislamiento:** una base nueva por corrida y limpieza entre tests. La corrida aborta si la URL de
  pruebas coincide con `DATABASE_URL`.
- Las migraciones de `drizzle/` se aplican antes del primer test.
- El reintento ante suspensión de Neon se prueba con un cliente simulado que falla N veces, sin
  suspender ninguna base real.

## Alternativas consideradas

- **Rama de Neon dedicada a tests** — mismo motor y driver que producción, pero necesita red y
  cuenta, consume horas de cómputo del free tier y puede suspenderse a mitad de la corrida. Queda
  abierta como prueba de humo opcional.
- **PGlite u otro Postgres embebido** — no necesita Docker, pero es un motor distinto del real; no
  conviene validar `EXCLUDE` con `btree_gist` contra un sustituto.
- **Jest** — más configuración para ESM y TypeScript, sin ventaja para este proyecto.

## Consecuencias

- Las restricciones de base se prueban contra el motor real, con corridas reproducibles y sin base
  que mantener a mano.
- Docker pasa a ser requisito para correr la suite con base; sin él la corrida falla con un mensaje
  claro y no pasa en silencio.
- El driver de pruebas difiere del de producción: el riesgo está en el transporte, no en el SQL, y
  se acota manteniendo el código específico del driver dentro de `src/db/`.
- Cada corrida paga el arranque del contenedor, unos segundos.
