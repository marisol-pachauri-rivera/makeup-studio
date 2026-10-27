import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Modelo del ADR 0005. Los precios son numeric(10,2): Drizzle los entrega como string.

/** Valores controlados: `text` tipado en TypeScript y respaldado por CHECK (ver design.md, decisión 3). */
function enLista(columna: unknown, valores: readonly string[]): SQL {
  return sql`${columna} in (${sql.raw(valores.map((v) => `'${v}'`).join(", "))})`;
}

export const ESTADOS_RESERVA = ["pendiente_pago", "pendiente_validacion", "confirmada", "cancelada"] as const;
export const ESTADOS_REEMBOLSO = ["no_aplica", "pendiente", "realizado"] as const;
export const MOTIVOS_CANCELACION = ["vencida", "clienta", "studio"] as const;

const creadoEn = () => timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();

export const servicio = pgTable(
  "servicio",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    descripcion: text().notNull().default(""),
    precio: numeric({ precision: 10, scale: 2 }).notNull(),
    duracionMinutos: integer("duracion_minutos").notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [
    check("servicio_precio_no_negativo", sql`${t.precio} >= 0`),
    check("servicio_duracion_positiva", sql`${t.duracionMinutos} > 0`),
  ],
);

export const maquilladora = pgTable("maquilladora", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull(),
  activa: boolean().notNull().default(true),
});

/** Disponibilidad recurrente. `diaSemana`: 0 = domingo (como Date.getDay). Hora local del studio. */
export const horarioTrabajo = pgTable(
  "horario_trabajo",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    maquilladoraId: integer("maquilladora_id")
      .notNull()
      .references(() => maquilladora.id, { onDelete: "restrict" }),
    diaSemana: smallint("dia_semana").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFin: time("hora_fin").notNull(),
  },
  (t) => [
    index("horario_trabajo_maquilladora_idx").on(t.maquilladoraId),
    check("horario_trabajo_dia_valido", sql`${t.diaSemana} between 0 and 6`),
    check("horario_trabajo_fin_posterior", sql`${t.horaFin} > ${t.horaInicio}`),
  ],
);

export const bloqueoAgenda = pgTable(
  "bloqueo_agenda",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    maquilladoraId: integer("maquilladora_id")
      .notNull()
      .references(() => maquilladora.id, { onDelete: "restrict" }),
    inicio: timestamp({ withTimezone: true }).notNull(),
    fin: timestamp({ withTimezone: true }).notNull(),
    motivo: text().notNull(),
  },
  (t) => [
    index("bloqueo_agenda_maquilladora_idx").on(t.maquilladoraId),
    check("bloqueo_agenda_fin_posterior", sql`${t.fin} > ${t.inicio}`),
  ],
);

export const usuarioAdmin = pgTable("usuario_admin", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  usuario: text().notNull().unique("usuario_admin_usuario_unico"),
  passwordHash: text("password_hash").notNull(),
  creadoEn: creadoEn(),
});

/**
 * Intentos de inicio de sesión fallidos (ADR 0012). `usuario` va normalizado y no referencia a
 * `usuario_admin`: también se registran nombres que no existen. Nunca guarda contraseñas.
 */
export const intentoLogin = pgTable(
  "intento_login",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    usuario: text().notNull(),
    intentadoEn: timestamp("intentado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intento_login_usuario_instante_idx").on(t.usuario, t.intentadoEn)],
);

export const reserva = pgTable(
  "reserva",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Credencial de acceso del enlace público (ADR 0004); la genera la base. */
    token: uuid().notNull().defaultRandom().unique("reserva_token_unico"),
    nombreContacto: text("nombre_contacto").notNull(),
    telefonoContacto: text("telefono_contacto").notNull(),
    estado: text({ enum: ESTADOS_RESERVA }).notNull().default("pendiente_pago"),
    /** Nulo hasta que la clienta lo ingresa; único cuando existe (varios nulos conviven). */
    numeroOperacion: text("numero_operacion").unique("reserva_numero_operacion_unico"),
    /** Clave del intento de reserva (ADR 0009): reenviarla devuelve esta reserva en vez de crear otra. */
    claveIdempotencia: uuid("clave_idempotencia").unique("reserva_clave_idempotencia_unica"),
    montoTotal: numeric("monto_total", { precision: 10, scale: 2 }).notNull(),
    estadoReembolso: text("estado_reembolso", { enum: ESTADOS_REEMBOLSO }).notNull().default("no_aplica"),
    motivoRechazo: text("motivo_rechazo"),
    motivoCancelacion: text("motivo_cancelacion", { enum: MOTIVOS_CANCELACION }),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    validadaEn: timestamp("validada_en", { withTimezone: true }),
  },
  (t) => [
    check("reserva_estado_valido", enLista(t.estado, ESTADOS_RESERVA)),
    check("reserva_reembolso_valido", enLista(t.estadoReembolso, ESTADOS_REEMBOLSO)),
    check(
      "reserva_motivo_cancelacion_valido",
      sql`${t.motivoCancelacion} is null or ${enLista(t.motivoCancelacion, MOTIVOS_CANCELACION)}`,
    ),
    check("reserva_monto_no_negativo", sql`${t.montoTotal} >= 0`),
    check(
      "reserva_estado_numero_coherente",
      sql`(${t.estado} = 'pendiente_pago' and ${t.numeroOperacion} is null)
        or (${t.estado} in ('pendiente_validacion', 'confirmada') and ${t.numeroOperacion} is not null)
        or ${t.estado} = 'cancelada'`,
    ),
    check(
      "reserva_cancelacion_coherente",
      sql`(${t.estado} = 'cancelada') = (${t.motivoCancelacion} is not null)`,
    ),
  ],
);

/** Una línea por persona. `precio` es copia del servicio al reservar; `activa` ocupa la agenda. */
export const reservaLinea = pgTable(
  "reserva_linea",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    reservaId: integer("reserva_id")
      .notNull()
      .references(() => reserva.id, { onDelete: "restrict" }),
    persona: text().notNull(),
    servicioId: integer("servicio_id")
      .notNull()
      .references(() => servicio.id, { onDelete: "restrict" }),
    maquilladoraId: integer("maquilladora_id")
      .notNull()
      .references(() => maquilladora.id, { onDelete: "restrict" }),
    inicio: timestamp({ withTimezone: true }).notNull(),
    fin: timestamp({ withTimezone: true }).notNull(),
    precio: numeric({ precision: 10, scale: 2 }).notNull(),
    activa: boolean().notNull().default(true),
  },
  (t) => [
    index("reserva_linea_reserva_idx").on(t.reservaId),
    check("reserva_linea_fin_posterior", sql`${t.fin} > ${t.inicio}`),
    check("reserva_linea_precio_no_negativo", sql`${t.precio} >= 0`),
  ],
);
