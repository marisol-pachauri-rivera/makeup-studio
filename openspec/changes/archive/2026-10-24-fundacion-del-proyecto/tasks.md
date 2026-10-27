# Tasks

## 1. ADR 0011 y decisión de testing

- [x] 1.1 Verificar que Docker está disponible en la máquina de desarrollo (`docker version`) y confirmar con el usuario el enfoque de testing del diseño (Vitest + Postgres en contenedor + `node-postgres` en pruebas). Si no hay Docker, detenerse y acordar la alternativa antes de seguir
- [x] 1.2 Redactar `adrs/0011-framework-de-testing.md` (formato de los ADRs existentes: Estado, Contexto, Decisión, Alternativas, Consecuencias) con las alternativas A, B y C del diseño y la versión mayor de Postgres de Neon. Verificar que el ADR existe y el usuario lo marca como Aceptado
- [x] 1.3 Agregar la fila de ADR-0011 a la tabla de `TECH-DESIGN.md` y quitar el riesgo "Sin framework de testing definido". Verificar con una búsqueda que ya no queda ese texto

## 2. Aplicación base Next.js + TypeScript

- [x] 2.1 Generar la app con `create-next-app` en la raíz (App Router, `src/`, TypeScript estricto, ESLint, alias `@/*`) sin sobrescribir `PRD.md`, `TECH-DESIGN.md`, `BACKLOG.md`, `adrs/`, `CLAUDE.md` ni `openspec/`. Verificar que esos archivos siguen intactos y que `npm run dev` responde en `localhost`
- [x] 2.2 Fijar versiones exactas en `package.json` y confirmar que existen los scripts `dev`, `build`, `start`, `lint` y `test`. Verificar con `npm run lint` y `npm run build` sin errores
- [x] 2.3 Reemplazar la página de inicio por un marcador mínimo (título provisional, sin lógica de negocio). Verificar que `npm run build` genera la ruta `/`
- [x] 2.4 Crear `.env.example` con `DATABASE_URL` y asegurar que `.env*` con secretos queda en `.gitignore`. Verificar con `git check-ignore` o inspección del `.gitignore`

## 3. Interfaz: Tailwind y shadcn/ui

- [x] 3.1 Confirmar la configuración de Tailwind CSS y ejecutar `shadcn init` con el tema base. Verificar que `components.json` existe y que una clase de Tailwind se aplica en la página de inicio
- [x] 3.2 Agregar solo el componente `button` de shadcn/ui, que usarán las páginas de error. Verificar que compila y se renderiza con viewport de 360 px sin desplazamiento horizontal

## 4. Acceso a datos con Drizzle y Neon

- [x] 4.1 Instalar `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` y `ws`. Verificar que `npm install` termina sin errores
- [x] 4.2 Crear `src/db/` con el cliente Drizzle sobre `neon-serverless` (Pool), marcado solo servidor y con lectura perezosa de `DATABASE_URL`, que falla con mensaje claro si falta. Verificar con un test unitario de variable ausente y variable presente (requisitos de conexión por entorno)
- [x] 4.3 Crear `drizzle.config.ts`, el directorio `drizzle/` y los scripts `db:generate` y `db:migrate`. Verificar que ambos comandos terminan sin error con el esquema vacío
- [x] 4.4 Implementar el reintento acotado con constantes únicas (4 intentos, 300/600/1200 ms), clasificación de errores de conexión, aplicado a la adquisición de conexión y a consultas sueltas, no dentro de transacciones abiertas, y error propio de acceso a datos al agotarse. Verificar con tests unitarios de los cuatro escenarios: éxito tras reintento, agotamiento con el máximo de intentos, error de restricción sin reintento y mensaje sin detalle técnico
- [x] 4.5 Registrar en el log del servidor la causa original al fallar definitivamente y no propagarla a la UI. Verificar con un test que el error mostrado a la capa de página no contiene el mensaje de la base

## 5. Páginas de error amigables

- [x] 5.1 Crear `src/app/error.tsx` en español con mensaje comprensible y botón de reintentar, sin renderizar `error.message` ni la traza. Verificar con un test de componente que el texto del error no aparece y que el botón invoca `reset`
- [x] 5.2 Crear `src/app/global-error.tsx` autocontenido con su propio `<html>` y `<body>`. Verificar con un test de componente que renderiza el mensaje amigable sin depender del layout
- [x] 5.3 Crear `src/app/not-found.tsx` con enlace al inicio. Verificar en `npm run dev` que una URL inexistente responde 404 con la página propia
- [x] 5.4 Verificar manualmente con una ruta temporal que lanza un error, que se ve la página amigable en `npm run build && npm run start` y que la ruta temporal se elimina después

## 6. Entorno de testing con Postgres real

- [x] 6.1 Instalar Vitest, Testcontainers para Postgres, `pg` y el soporte de pruebas de componentes elegido en el ADR 0011. Verificar que `npm install` termina sin errores
- [x] 6.2 Configurar Vitest y el script `test` para que falle con código distinto de cero si algún test falla. Verificar con un test trivial verde (código 0) y uno temporal rojo (código distinto de cero), eliminando el segundo
- [x] 6.3 Implementar el `globalSetup`: levantar el contenedor Postgres, exponer su URL a los tests, aplicar las migraciones de `drizzle/` tolerando el directorio vacío y destruir el contenedor al terminar. Verificar con un test de integración que ejecuta `select version()` contra el motor real
- [x] 6.4 Agregar la guarda de aislamiento: abortar antes de correr tests si la URL de pruebas coincide con `DATABASE_URL`, y fallar con un mensaje que indique cómo levantar la base si no hay Docker. Verificar con un test de la guarda con ambas URLs iguales y simulando Docker ausente
- [x] 6.5 Agregar el helper de aislamiento entre tests (transacción revertida o truncado) y un test que lo demuestre ejecutando dos escrituras en cualquier orden con el mismo resultado
- [x] 6.6 Verificar que `npm run test` completo pasa de cero en un clon limpio y que el contenedor no queda corriendo (`docker ps`)

## 7. Documentación y verificación final

- [x] 7.1 Actualizar `CLAUDE.md`: reemplazar "framework de testing aún no definido" por el framework elegido y agregar los scripts `db:generate` y `db:migrate`. Verificar que los comandos documentados se ejecutan tal como están escritos
- [x] 7.2 Documentar en un `README.md` breve los requisitos (Node, Docker), las variables de entorno y cómo correr la app y los tests. Verificar siguiendo el README desde cero
- [x] 7.3 Verificación integral del ítem #1: `npm run lint`, `npm run build` y `npm run test` pasan seguidos, y se confirma que el cambio no introdujo tablas, Auth.js, Server Actions ni pantallas de negocio. Verificar revisando el árbol de archivos contra el alcance del ítem #1 del backlog

## Workflow follow-up

- Archivar el change una vez aprobada la revisión del ítem #1.
- Marcar el ítem #1 como hecho en `BACKLOG.md` si el equipo lleva ese registro.
