# Design

## Context

Estado de partida (ítems #1 a #3 archivados): las tablas `servicio` (`nombre`, `descripcion`, `precio numeric(10,2)`, `duracion_minutos`, `activo`) y `maquilladora` (`nombre`, `activa`) existen con sus CHECK, y las claves foráneas desde `reserva_linea`, `horario_trabajo` y `bloqueo_agenda` son `ON DELETE RESTRICT`, así que borrar con historial ya es imposible a nivel de base. El panel tiene el guardia `requerirAdmin()` (acciones) y `requerirAdminOLogin()` (páginas), un layout protegido en `src/app/admin/(panel)/` y una prueba de convención que exige `await requerirAdmin()` como primera acción en todo `actions.ts` bajo `src/app/admin/`. Ver `proposal.md` para el motivo.

Restricciones que condicionan el diseño:
- ADR 0006: lecturas en Server Components, escrituras en Server Actions, Zod en el servidor y sesión verificada en cada acción. ADR 0010: shadcn/ui.
- Next 16 con `cacheComponents`: la lectura de sesión es en tiempo de petición y va detrás de `<Suspense>`. Un layout no se re-ejecuta al navegar entre páginas, por eso cada página verifica la sesión por su cuenta. `params` y `searchParams` son promesas y los tipos `PageProps<...>` se generan con `next build`.
- Drizzle entrega `numeric` como `string`: el precio nunca pasa por `number` para no perder exactitud.
- No hay migraciones en este ítem: el esquema alcanza.

## Goals / Non-Goals

**Goals:**
- Que #5 (horarios y bloqueos) y #14 (agenda) reutilicen el patrón de sección del panel (página de lista, formulario, `actions.ts`) sin reinventarlo.
- Que la lógica de escritura se pruebe contra Postgres real sin montar Next, inyectando la base como en `limite-intentos.ts`.

**Non-Goals:**
- Caché o invalidación del catálogo público: #6 define sus propias lecturas.
- Controlar cuántos servicios o maquilladoras activas hay, ni reglas entre ellos.
- Concurrencia entre dos administradoras que editan el mismo registro: gana la última escritura.

## Decisions

### 1. Capa de datos con la base inyectada, acciones delgadas
`src/lib/catalogo/servicios.ts` y `src/lib/catalogo/maquilladoras.ts` exponen funciones que reciben la base (`listar`, `obtener`, `crear`, `actualizar`, `cambiarActivo`) y no conocen Next ni la sesión. Las Server Actions hacen solo: `await requerirAdmin()` → parsear `FormData` con Zod → llamar a la función con `getDb()` → `redirect` o devolver el estado de error. Así la lógica se prueba con Testcontainers (ADR 0011) y la prueba de convención sigue siendo suficiente para la seguridad de las acciones.
- *Alternativa:* consultas Drizzle directamente en las acciones y las páginas. Menos archivos, pero obliga a montar Next o a mockear la base para probar.

### 2. Esquemas Zod en un módulo compartido, con el precio como texto
`src/lib/catalogo/esquemas.ts` define `servicioSchema` y `maquilladoraSchema`, usados por las acciones y reutilizables por los formularios para mensajes. `FormData` entrega texto, así que:
- Precio: texto que cumple `dígitos[.|,dígitos(1-2)]`, hasta 8 enteros (cabe en `numeric(10,2)`); la coma se normaliza a punto y se guarda como `string` (`"350.50"`). Sin `Number`/`parseFloat`.
- Duración: texto de dígitos, convertido a entero, entre 1 y 720.
- Nombre: `trim`, 1 a 100 caracteres. Descripción: `trim`, hasta 500, opcional (se guarda `""`).
Los límites 100/500/720 y la coma decimal son supuestos razonables que no vienen del PRD; están en las specs y son fáciles de cambiar.
- *Alternativa:* `z.coerce.number()` para precio. Rechazada: redondeo binario y acepta `1e3`, `Infinity` y vacío como 0.

### 3. Estado de formulario con `useActionState`, igual que el login
Cada acción de guardado devuelve `{ errores?: Record<campo, string[]>, mensaje?: string, valores }` para mostrar errores por campo y conservar lo escrito (spec: "Se conservan los datos escritos"). En éxito hace `redirect("/admin/servicios")` fuera de `try/catch` (`redirect` lanza una excepción). El botón se deshabilita mientras la acción está pendiente para evitar el doble clic.
- *Alternativa:* validar en el cliente. Se descarta como mecanismo: la validación de verdad es la del servidor; el cliente puede sumar atributos HTML (`required`, `maxLength`) como ayuda, sin reemplazarla.

### 4. Rutas y páginas
`/admin/servicios` (lista), `/admin/servicios/nuevo` y `/admin/servicios/[id]` (edición); lo mismo para `/admin/maquilladoras`. Un solo componente de formulario por entidad sirve a alta y edición. Cada página lee la sesión con `requerirAdminOLogin()` dentro de `<Suspense>`, valida `id` con Zod (entero positivo) y usa `notFound()` si es inválido o no existe. Las lecturas del panel son dinámicas: no usan `'use cache'`, así que no hace falta invalidar nada tras escribir.
- *Alternativa:* edición en un diálogo sobre la lista. Más compacta, pero añade estado de cliente y complica `notFound` y los enlaces directos; con pocos registros no se justifica.

### 5. Activar y desactivar con valor destino explícito
Una acción por entidad (`cambiarEstadoServicio`, `cambiarEstadoMaquilladora`) recibe el `id` y el estado **destino** (`activo=true|false`) en campos ocultos del formulario del botón; no alterna. Un doble clic o un reenvío da el mismo resultado (idempotente). Si el `UPDATE ... RETURNING` no devuelve fila, el registro no existe y se responde "no encontrado" con `notFound()` (válido dentro de Server Functions). Como la acción se invoca desde el propio listado y no redirige, termina con `refresh()` de `next/cache` para que la página muestre el estado nuevo (la documentación de Next 16.4 lo indica para refrescar la página actual sin tocar datos cacheados; las lecturas del panel no están cacheadas). No hay acción de borrado ni botón: la base ya lo impediría con historial, y para el panel "desactivar" es la única baja.
- *Alternativa:* un solo `activo` dentro del formulario de edición. Se descarta: obliga a abrir la edición para algo que se hace seguido, y mezcla dos acciones con efectos distintos.

### 6. Reactivar está permitido
La spec pide desactivar; reactivar no estaba pedido explícitamente pero sin él un error obliga a tocar SQL, y el modelo ya lo soporta (solo es un booleano). Se incluye en las specs para que quede acordado.

### 7. Navegación y componentes
Enlaces "Servicios" y "Maquilladoras" en la cabecera de `(panel)/layout.tsx` (sin resaltado de ruta activa) y accesos en `/admin`. Se agregan con el CLI de shadcn los componentes `table`, `textarea` y `badge` (ADR 0010); el estado inactivo se muestra con `badge` y también con texto, para no depender solo del color.

### 8. Pruebas
- Unitarias: esquemas (precio con coma, con más decimales, vacío, `1e3`; duración 0/721/decimal; nombre solo espacios), componentes de formulario con Testing Library (errores por campo, valores conservados, botón deshabilitado al enviar).
- Integración con Postgres real: funciones de datos (alta, edición, estado, inexistente, precio exacto `350.50`, el historial de líneas conserva su precio al editar el servicio, borrar con historial sigue siendo rechazado por la base).
- Acciones: con `requerirAdmin` simulado para lanzar `NoAutorizado` se comprueba que no se invoca ninguna función de datos; la prueba de convención de #3 ya recorre los nuevos `actions.ts` sin cambios.

## Risks / Trade-offs

- **Alta duplicada por reintento de red** → el botón se deshabilita y se redirige al terminar; si igual se duplica no se puede borrar, solo desactivar. Se acepta porque el nombre no es único y el volumen es mínimo.
- **Desactivar una maquilladora con reservas futuras** → no se advierte ni se cancelan (fuera de alcance); las reservas siguen vigentes y el studio las gestiona desde #11. #6 deberá tratar las inactivas como no elegibles.
- **El catálogo público (#6) puede cachear lecturas** → si lo hace con `'use cache'` y etiquetas, esas acciones deberán llamar a `updateTag`; queda como tarea de #6 y no se anticipa aquí para no inventar etiquetas sin consumidor.
- **Límites 100/500/720 arbitrarios** → viven en el esquema y en las specs; cambiarlos es una línea y una prueba.
- **Sin login real contra una base** (pendiente de #3, tareas 5.2 y 5.3) → la verificación de las pantallas se apoya en pruebas de componente, `next build` y las pruebas de integración; la comprobación manual de punta a punta se hace al aplicar las migraciones a Neon.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega como código; no hay que migrar datos. Rollback: revertir el despliegue; los servicios y maquilladoras cargados siguen siendo válidos para el esquema existente.

## Open Questions

- ¿Qué moneda y formato mostrar junto al precio (símbolo, separador de miles)? Hasta saberlo el panel muestra el monto con dos decimales y sin símbolo; agregar uno no cambia specs ni tareas.
