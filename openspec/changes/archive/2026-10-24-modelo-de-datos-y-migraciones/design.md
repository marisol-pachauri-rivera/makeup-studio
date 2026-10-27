# Design

## Context

El ítem #1 dejó `src/db/schema.ts` vacío, `drizzle.config.ts` apuntando a él, `drizzle/` con el
journal vacío y un `globalSetup` que levanta `postgres:17` y aplica las migraciones antes de los
tests. Los tests usan `drizzle-orm/node-postgres`; producción usa el driver de Neon (ADR 0011). El
modelo y sus justificaciones ya están decididos en el ADR 0005 y la exclusión en el ADR 0003; este
diseño solo resuelve cómo expresarlos. Motivación en `proposal.md` y requisitos en `specs/`.
Drizzle no puede declarar restricciones `EXCLUDE`, por lo que esa parte va en SQL a mano
(`drizzle-kit generate --custom`).

## Goals / Non-Goals

**Goals:**
- Un esquema Drizzle que refleje fielmente el ADR 0005, más una migración inicial que lo aplique
  en una base vacía, incluida la exclusión.
- Que cada restricción pueda probarse contra Postgres real, incluido el caso concurrente.
- Que los códigos de error de las violaciones sean identificables por la aplicación (ADR 0009).

**Non-Goals:**
- Lógica de aplicación sobre las tablas (vencimiento, reintento, transacciones de reserva,
  idempotencia, generación de token en código), Zod, Server Actions, seed del admin, y datos de
  ejemplo.
- Evitar solapamientos entre filas de `horario_trabajo` de una misma maquilladora, o validar un
  bloqueo contra reservas existentes: el ADR 0005 no lo pide y pertenece al panel (#5).
- Índices por rendimiento más allá de los de claves foráneas; se agregan cuando haya consultas
  reales (#6).

## Decisions

### 1. Un solo archivo de esquema, `src/db/schema.ts`
Siete tablas caben en un archivo legible y evitan cambiar la ruta que ya usa `drizzle.config.ts`.
*Alternativa:* un directorio por entidad. Se descarta por ahora; se divide si el archivo crece.

### 2. Claves primarias `integer generated always as identity`; el token va aparte
Las referencias internas usan enteros. El acceso público usa solo `reserva.token`, de tipo `uuid`
con `default gen_random_uuid()` (incorporado en Postgres 13+, aleatorio de 122 bits, sin extensión),
`NOT NULL` y `UNIQUE`. Así el token nunca deriva del id y la base lo genera aunque la aplicación
no lo informe, con lo que la propiedad "no adivinable" no depende de que el código la recuerde.
*Alternativa:* UUID como clave primaria de `reserva`. Descartada: mezcla identidad interna y
credencial de acceso.

### 3. Valores controlados con `text` más `CHECK`, no `pgEnum`
Estado de reserva, estado de reembolso y motivo de cancelación son columnas `text` tipadas en
TypeScript con la lista de valores y respaldadas por `CHECK ... IN (...)`. Agregar un valor (p. ej.
un nuevo motivo) es un `ALTER` de la restricción dentro de una transacción, sin las limitaciones de
`ALTER TYPE ... ADD VALUE`.
*Alternativa:* `pgEnum`. Se descarta por la fricción al evolucionarlos, con un costo de tipado
nulo en ambos casos.

### 4. Tipos de tiempo y dinero
- Inicio y fin de líneas, bloqueos y fechas de reserva: `timestamptz` (instante absoluto), usado
  como `Date` en TypeScript.
- `horario_trabajo`: `dia_semana smallint` de 0 a 6 con 0 = domingo (igual que `Date.getDay()`), y
  `hora_inicio`/`hora_fin` de tipo `time` sin zona, hora local del studio. La zona horaria con que
  se interpretan la fija el cálculo de disponibilidad (#6), no el esquema.
- Precios y montos: `numeric(10,2)`, que Drizzle entrega como `string` para no perder precisión;
  la conversión a número para mostrar es de la capa de interfaz. No se fija moneda en el esquema.
*Alternativa:* enteros en centavos. Válida, pero obliga a convertir en cada formulario del panel.

### 5. Restricciones `CHECK` en el esquema Drizzle
Las expresadas con `check()` quedan en el snapshot de Drizzle y viajan en la migración generada:
precio y monto `>= 0`, duración `> 0`, `fin > inicio` en horarios, bloqueos y líneas, día de 0 a 6,
y las de valores controlados. Las de coherencia de `reserva` son:
- `pendiente_pago` ⇒ `numero_operacion IS NULL`; `pendiente_validacion` y `confirmada` ⇒ NOT NULL;
  `cancelada` admite ambos (puede conservar el número de un pago validado, para el reembolso).
- `motivo_cancelacion IS NOT NULL` si y solo si `estado = 'cancelada'`.
Estas coherencias se evalúan por fila al terminar cada sentencia, así que un rechazo de pago o una
cancelación que cambian estado y columnas en un mismo `UPDATE` las cumplen. No se agrega ninguna
regla sobre `motivo_rechazo`, que el ADR 0005 deja a la aplicación.
*Riesgo asumido:* son reglas estrictas; si un flujo posterior las necesita laxas, se relajan con una
migración.

### 6. `UNIQUE` y claves foráneas
`UNIQUE` en `reserva.numero_operacion` (Postgres permite varios nulos, lo que el ADR 0005 necesita),
en `reserva.token` y en `usuario_admin.usuario`. Todas las claves foráneas son `ON DELETE RESTRICT`:
nada se borra en cascada, se desactiva (`activo`, `activa`) y se cancela. Se indexan las claves
foráneas de `reserva_linea.reserva_id`, `horario_trabajo.maquilladora_id` y
`bloqueo_agenda.maquilladora_id`; el índice GiST de la exclusión ya sirve a las consultas por
maquilladora y rango.

### 7. La exclusión va en una migración SQL a mano, separada de la generada
Las migraciones se generan por etapas, para que cada una llegue con sus tests: `0000` con las tablas
de referencia, `0001` con las de reserva (ambas generadas por Drizzle, con sus `CHECK`) y `0002` con
`drizzle-kit generate --custom`, que contiene:
```
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reserva_linea ADD CONSTRAINT reserva_linea_sin_solapamiento
  EXCLUDE USING gist (maquilladora_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
  WHERE (activa);
```
Rango semiabierto, para que turnos contiguos (fin = inicio siguiente) convivan. Una restricción con
nombre fijo permite que la aplicación distinga el choque por su código `23P01` y su nombre. La base
no conoce el vencimiento: una línea de reserva vencida sigue ocupando hasta que la aplicación la
desactive (ADR 0003, ítem #8).
*Alternativa:* editar el SQL de `0001`. Se descarta: una migración manual separada es explícita y
sobrevive a regenerar las generadas.
*Limitación conocida:* el snapshot de Drizzle no conoce la exclusión, de modo que futuros
`generate` ni la verán ni la romperán, pero tampoco la recrearán si se rehace la tabla; cualquier
migración que reconstruya `reserva_linea` debe repetirla.

### 8. Estrategia de tests de integración
Los tests de este cambio son `*.int.test.ts` en `tests/modelo/`, sobre la infraestructura de #1:
- Un helper `esperarRechazo` ejecuta una sentencia dentro de un `SAVEPOINT` y devuelve el código y
  el nombre de la restricción (`error.cause.code` y `.constraint` en Drizzle 0.45), porque tras un
  error Postgres aborta la transacción entera.
- Un módulo de fixtures crea maquilladora, servicio y reserva válidos para no repetir datos.
- Casi todos los casos corren en `enTransaccionRevertida`. El caso de concurrencia usa dos
  conexiones que confirman de verdad, así que limpia con `TRUNCATE ... CASCADE` al terminar.
- Un test comprueba que la migración aplicada deja registradas las tres migraciones y que existen
  la extensión y la restricción de exclusión en el catálogo de Postgres.
- La ausencia de diferencias entre esquema y migraciones se verifica ejecutando
  `npm run db:generate` y confirmando que no genera nada; es un paso de las tareas, no un test
  automático, porque `generate` escribe archivos.

## Risks / Trade-offs

- **Deadlock en la carrera por un horario** → medido con dos conexiones reales: en una parte de las
  corridas, la transacción perdedora recibe `40P01` (deadlock detectado) en lugar de `23P01`,
  porque ambas insertan de forma provisional y se esperan. Siempre gana exactamente una y no queda
  solapamiento. El ítem #7 debe traducir ambos códigos a "horario ya no disponible" (ADR 0009);
  aquí solo se deja constancia y se prueba que el resultado final es correcto.
- **`btree_gist` en Neon** → es una extensión de confianza en Postgres 13+ y Neon la soporta, pero
  no se prueba aquí contra Neon. Verificar al aplicar la primera migración en la base real; el SQL
  falla de forma explícita si no estuviera.
- **Drift entre el SQL a mano y el esquema Drizzle** → el test de catálogo y el nombre fijo de la
  restricción lo vuelven visible; queda documentada la limitación de la decisión 7.
- **`CHECK` de coherencia demasiado estrictos para flujos posteriores** → se fijan solo las
  reglas que el ADR 0005 afirma sin ambigüedad, y se pueden relajar con una migración.
- **El driver de pruebas difiere del de producción** (ADR 0011) → el modelo no usa nada específico
  del driver; los códigos de error de Postgres son los mismos.
- **Precio como `string`** → fuente de errores si se mezcla con números; se documenta en el
  esquema y se resuelve en la capa de presentación (#4 y #6).

## Migration Plan

1. Generar `0000` y `0001` desde el esquema y `0002` en SQL a mano; revisar el SQL resultante.
2. Aplicarlas sobre la base de pruebas (lo hace el `globalSetup`) y sobre un Postgres limpio con
   `npm run db:migrate`.
3. Aplicarlas a Neon en el despliegue (fuera de este cambio).
Reversión: no se escriben migraciones inversas. Las migraciones de Drizzle son solo hacia adelante,
y al no haber datos en producción antes de este ítem, el rollback es recrear la base. Desde que
exista data real, cualquier cambio de esquema se hace con una migración nueva.

## Open Questions

- La zona horaria del studio con que se leen `hora_inicio` y `hora_fin` se fija en el cálculo de
  disponibilidad (#6) y puede decidirse entonces sin cambiar este esquema.
