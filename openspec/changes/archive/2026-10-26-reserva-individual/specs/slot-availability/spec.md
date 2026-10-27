## MODIFIED Requirements

### Requirement: Consulta pública de horarios por día
La pantalla de disponibilidad SHALL, una vez elegida la maquilladora, listar los días con al menos un horario libre y mostrar los horarios libres del día elegido, que por defecto es el primer día con disponibilidad. Los horarios MUST mostrarse con la hora local, MUST poder elegirse para iniciar la reserva y MUST NOT incluir datos de otras clientas. Si ningún día tiene horarios MUST indicarlo claramente. La consulta MUST NOT requerir sesión.

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
- **WHEN** la clienta elige un horario libre
- **THEN** pasa al paso de confirmación de la reserva, y elegirlo no reserva ni bloquea el horario hasta que confirma
