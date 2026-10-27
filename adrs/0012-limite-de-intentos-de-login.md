# ADR 0012: Límite de intentos de inicio de sesión persistido en PostgreSQL

## Estado

Aceptado

## Contexto

El ADR 0007 exige un límite de intentos de inicio de sesión del panel, y el criterio de aceptación
"un intento de inicio de sesión repetido fallido queda limitado" lo hace verificable. El sistema
corre en Vercel Hobby como funciones serverless sin estado compartido y sin cron (ADR 0002 y
ADR 0004), y PostgreSQL en Neon es la única persistencia. Un contador en memoria no sobrevive entre
invocaciones, y el modelo de datos del ADR 0005 no tenía dónde guardar este estado.

## Decisión

Se agrega la tabla `intento_login` con el nombre de usuario normalizado (sin espacios en los
extremos y en minúsculas) y el instante de cada intento fallido; solo se guardan fallos y nunca la
contraseña. Con 5 fallos de un mismo usuario en una ventana de 15 minutos se rechazan nuevos
intentos, incluso con la contraseña correcta, hasta que el fallo más antiguo salga de la ventana.
Los fallos se cuentan también para usuarios que no existen, para no revelar cuáles existen. Un
inicio de sesión exitoso borra los fallos del usuario, y los fallos vencidos se borran de forma
lazy en cada intento de ese usuario (sin cron).

## Alternativas consideradas

- **Contador en columnas de `usuario_admin`** — no cubre usuarios inexistentes (permitiría
  enumerarlos) y mezcla estado transitorio con la identidad.
- **Límite por IP** — en Vercel depende de `x-forwarded-for`, fácil de falsear, y penaliza IP
  compartidas.
- **Redis o Upstash** — servicio externo que el ADR 0002 no contempla para esta versión.

## Consecuencias

- Funciona entre invocaciones y despliegues sin servicios adicionales.
- Alguien puede bloquear a propósito la cuenta de una administradora durante 15 minutos; se acepta
  por ser pocas cuentas y un bloqueo corto.
- Dos intentos simultáneos pueden superar el tope por uno o dos intentos; no se justifica un
  bloqueo de fila para evitarlo.
- Cada intento de login agrega consultas a Neon; el índice por usuario e instante las mantiene
  baratas.
- Extiende el modelo de datos del ADR 0005 con una tabla; complementa el ADR 0007.
