## Purpose

Calcular y mostrar a la clienta los horarios en que una maquilladora puede atender un servicio, a partir del horario de trabajo, los bloqueos, las reservas que ya ocupan agenda y la duración del servicio, siempre en la hora local del studio.

## ADDED Requirements

### Requirement: Horarios libres según el horario de trabajo
Para un servicio y una maquilladora, el sistema SHALL ofrecer como horarios libres solo los inicios que caen dentro de un tramo de su `horario_trabajo` del día de la semana correspondiente y en los que el servicio completo termina dentro de ese tramo. Los inicios MUST seguir una grilla de 30 minutos que parte de la hora de inicio del tramo. Un día sin tramos MUST NOT ofrecer horarios.

#### Scenario: Servicio que cabe en el tramo
- **WHEN** la maquilladora trabaja de 09:00 a 12:00 y el servicio dura 60 minutos
- **THEN** los horarios libres son 09:00, 09:30, 10:00, 10:30 y 11:00, y no 11:30

#### Scenario: Servicio que no cabe
- **WHEN** el servicio dura 4 horas y el tramo es de 09:00 a 12:00
- **THEN** no se ofrece ningún horario ese día

#### Scenario: Dos tramos separados
- **WHEN** trabaja de 09:00 a 13:00 y de 15:00 a 19:00 y el servicio dura 60 minutos
- **THEN** no se ofrece ningún inicio entre las 12:30 y las 15:00, y el último inicio de la mañana es 12:00

#### Scenario: Día sin horario
- **WHEN** la maquilladora no tiene tramos el domingo
- **THEN** ningún domingo ofrece horarios

#### Scenario: Grilla anclada al inicio del tramo
- **WHEN** el tramo empieza a las 09:15
- **THEN** los inicios son 09:15, 09:45, 10:15 y así sucesivamente

### Requirement: Tramos contiguos como uno solo
Los tramos de un mismo día en que el fin de uno es igual al inicio del siguiente SHALL tratarse como un solo tramo continuo, de modo que un servicio pueda cruzar el punto de unión.

#### Scenario: Tramos contiguos
- **WHEN** trabaja de 09:00 a 13:00 y de 13:00 a 17:00 y el servicio dura 60 minutos
- **THEN** se ofrece el inicio 12:30, porque el turno de 12:30 a 13:30 queda dentro del tramo continuo

#### Scenario: Tramos con un hueco
- **WHEN** trabaja de 09:00 a 13:00 y de 13:30 a 17:00
- **THEN** no se ofrece ningún turno que cruce el hueco entre las 13:00 y las 13:30

### Requirement: Bloqueos y reservas ocupan el horario
Un horario MUST NOT ofrecerse si el turno completo se solapa con un bloqueo de agenda de esa maquilladora o con una línea de reserva activa de esa maquilladora. Los rangos se tratan como semiabiertos: un turno que empieza justo cuando termina un bloqueo o una reserva, o que termina justo cuando empieza, MUST ofrecerse. Las líneas inactivas MUST NOT ocupar horario. Las reservas y bloqueos de otras maquilladoras MUST NOT afectar a esta.

#### Scenario: Bloqueo en medio del día
- **WHEN** hay un bloqueo de 10:00 a 12:00 y el servicio dura 60 minutos en un tramo de 09:00 a 14:00
- **THEN** se ofrecen 09:00, 12:00, 12:30 y 13:00, y no 09:30, 10:00, 10:30, 11:00 ni 11:30

#### Scenario: Bloqueo de varios días
- **WHEN** hay un bloqueo desde el 24/12 a las 14:00 hasta el 26/12 a las 09:00
- **THEN** el 25/12 no ofrece horarios y el 24/12 no ofrece ninguno que se cruce con el bloqueo

#### Scenario: Reserva activa
- **WHEN** existe una línea activa de 10:00 a 11:00 para esa maquilladora
- **THEN** no se ofrece ningún horario cuyo turno se cruce con ese rango

#### Scenario: Turnos contiguos
- **WHEN** existe una línea activa de 10:00 a 11:00 y el servicio dura 60 minutos
- **THEN** se ofrecen 09:00 (termina a las 10:00) y 11:00 (empieza a las 11:00)

#### Scenario: Línea inactiva
- **WHEN** una reserva fue cancelada y su línea quedó inactiva
- **THEN** su horario vuelve a ofrecerse

#### Scenario: Otra maquilladora
- **WHEN** otra maquilladora tiene una reserva de 10:00 a 11:00
- **THEN** ese horario sigue libre para la maquilladora consultada

#### Scenario: Reserva pendiente de pago
- **WHEN** una reserva en pendiente de pago tiene su línea activa en ese horario
- **THEN** el horario no se ofrece, porque la reserva pendiente ocupa agenda

### Requirement: Hora local del studio y horarios pasados
Los días, las horas del horario de trabajo y los horarios ofrecidos SHALL interpretarse y mostrarse en la hora local del studio (`America/Lima`), sin depender de la zona del servidor ni del navegador. El sistema MUST NOT ofrecer horarios cuyo inicio ya pasó. Se MUST ofrecer solo los próximos 30 días, contando el día de hoy.

#### Scenario: Hora local
- **WHEN** el horario de trabajo del lunes es de 09:00 a 18:00 y el servidor corre en UTC
- **THEN** los horarios se ofrecen y se muestran desde las 09:00 de Lima, no desde las 09:00 UTC

#### Scenario: Hoy solo lo que falta
- **WHEN** son las 10:10 en Lima y hoy se trabaja de 09:00 a 18:00 con un servicio de 60 minutos
- **THEN** el primer horario ofrecido hoy es 10:30

#### Scenario: Día de hoy sin horarios que queden
- **WHEN** hoy ya no queda ningún horario que alcance
- **THEN** hoy no se ofrece como día disponible y se ofrecen los días siguientes

#### Scenario: Límite de 30 días
- **WHEN** se consulta la disponibilidad
- **THEN** no se ofrece ningún día posterior a los próximos 30 contando hoy

### Requirement: Consulta pública de horarios por día
La pantalla de disponibilidad SHALL, una vez elegida la maquilladora, listar los días con al menos un horario libre y mostrar los horarios libres del día elegido, que por defecto es el primer día con disponibilidad. Los horarios MUST mostrarse con la hora local y MUST NOT incluir datos de otras clientas. Si ningún día tiene horarios MUST indicarlo claramente. La consulta MUST NOT requerir sesión.

#### Scenario: Días con disponibilidad
- **WHEN** la clienta elige una maquilladora con horarios cargados
- **THEN** ve los días con horarios libres y los horarios del primero

#### Scenario: Elegir otro día
- **WHEN** la clienta elige otro día de la lista
- **THEN** ve los horarios libres de ese día

#### Scenario: Día elegido sin horarios
- **WHEN** el enlace pide un día que no tiene horarios libres o que está fuera de los 30 días, o con una fecha inválida
- **THEN** se muestra el primer día con disponibilidad en su lugar, sin error

#### Scenario: Sin horarios cargados
- **WHEN** la maquilladora no tiene horario de trabajo
- **THEN** la pantalla indica que por ahora no tiene horarios disponibles y sugiere elegir otra maquilladora

#### Scenario: Sin datos de otras clientas
- **WHEN** hay reservas que ocupan horarios
- **THEN** la pantalla solo deja de ofrecer esos horarios y no muestra nombres, teléfonos ni motivos

#### Scenario: Sin reserva todavía
- **WHEN** la clienta ve un horario libre
- **THEN** el horario se muestra solo como información, porque elegirlo y reservar corresponde al flujo de reserva
