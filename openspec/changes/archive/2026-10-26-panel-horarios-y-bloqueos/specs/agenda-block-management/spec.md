## Purpose

Permitir que el studio cargue ausencias y cierres de cada maquilladora como bloqueos de agenda desde el panel, para que esos momentos dejen de ofrecerse como disponibles.

## ADDED Requirements

### Requirement: Consulta de bloqueos
La pantalla de agenda de una maquilladora SHALL listar todos sus bloqueos con fecha y hora de inicio, fecha y hora de fin y motivo, expresados en la hora local del studio. Los bloqueos que aún no terminaron MUST aparecer primero, ordenados por inicio ascendente, y los ya terminados después, claramente identificados como pasados.

#### Scenario: Bloqueos futuros y pasados
- **WHEN** una maquilladora tiene un bloqueo ya terminado y uno futuro
- **THEN** el futuro aparece primero y el terminado aparece después marcado como pasado

#### Scenario: Sin bloqueos
- **WHEN** la maquilladora no tiene bloqueos
- **THEN** la pantalla indica que no hay bloqueos cargados

### Requirement: Alta de un bloqueo
El sistema SHALL permitir a una administradora agregar un bloqueo indicando fecha y hora de inicio, fecha y hora de fin y un motivo. El fin MUST ser posterior al inicio y el motivo MUST ser obligatorio, con espacios sobrantes recortados y hasta 200 caracteres. Las fechas y horas se interpretan en la hora local del studio. Se permiten bloqueos que se solapen con otros bloqueos, con horarios o con reservas ya existentes.

#### Scenario: Alta válida
- **WHEN** la administradora agrega un bloqueo del 2026-12-24 14:00 al 2026-12-26 09:00 con motivo "Vacaciones"
- **THEN** el bloqueo queda guardado y aparece en la lista con esas fechas y horas locales

#### Scenario: Hora local del studio
- **WHEN** se guarda un bloqueo con inicio a las 09:00 locales
- **THEN** se muestra de nuevo como 09:00, sin desfase por zona horaria del navegador o del servidor

#### Scenario: Fin no posterior al inicio
- **WHEN** envía un bloqueo con fin igual o anterior al inicio
- **THEN** no se guarda y se muestra un error en el campo del fin

#### Scenario: Motivo vacío
- **WHEN** envía un bloqueo con el motivo vacío o solo con espacios
- **THEN** no se guarda y se muestra un error en el campo del motivo, conservando lo escrito en los demás

#### Scenario: Fecha inexistente
- **WHEN** envía una fecha u hora que no existe o no tiene formato válido
- **THEN** no se guarda y se muestra un mensaje claro en el campo correspondiente

#### Scenario: Reservas existentes dentro del bloqueo
- **WHEN** se agrega un bloqueo que cubre un turno ya reservado
- **THEN** el bloqueo se guarda y la reserva no se modifica ni se cancela

### Requirement: Baja de un bloqueo
El sistema SHALL permitir a una administradora quitar un bloqueo. Quitarlo MUST ser un borrado real, volver a liberar ese rango en la agenda y no afectar a otros bloqueos ni a las reservas.

#### Scenario: Quitar un bloqueo
- **WHEN** la administradora quita un bloqueo
- **THEN** deja de aparecer y los demás bloqueos siguen igual

#### Scenario: Bloqueo ya quitado
- **WHEN** se intenta quitar un bloqueo que ya no existe
- **THEN** la pantalla no falla y refleja el estado actual

#### Scenario: Bloqueo de otra maquilladora
- **WHEN** se intenta quitar un bloqueo indicando la agenda de una maquilladora a la que no pertenece
- **THEN** el bloqueo no se borra

### Requirement: Escrituras de bloqueos solo con sesión de administradora
Toda acción de escritura sobre los bloqueos SHALL verificar la sesión de administradora en el servidor y validar sus entradas antes de tocar la base, aunque se invoque directamente.

#### Scenario: Acción sin sesión
- **WHEN** se invoca directamente la acción de agregar o quitar un bloqueo sin sesión válida
- **THEN** se rechaza y no se modifica ningún dato
