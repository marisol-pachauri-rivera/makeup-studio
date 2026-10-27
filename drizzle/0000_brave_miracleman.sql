CREATE TABLE "bloqueo_agenda" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bloqueo_agenda_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"maquilladora_id" integer NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	CONSTRAINT "bloqueo_agenda_fin_posterior" CHECK ("bloqueo_agenda"."fin" > "bloqueo_agenda"."inicio")
);
--> statement-breakpoint
CREATE TABLE "horario_trabajo" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "horario_trabajo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"maquilladora_id" integer NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	CONSTRAINT "horario_trabajo_dia_valido" CHECK ("horario_trabajo"."dia_semana" between 0 and 6),
	CONSTRAINT "horario_trabajo_fin_posterior" CHECK ("horario_trabajo"."hora_fin" > "horario_trabajo"."hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "maquilladora" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "maquilladora_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicio" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "servicio_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"precio" numeric(10, 2) NOT NULL,
	"duracion_minutos" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "servicio_precio_no_negativo" CHECK ("servicio"."precio" >= 0),
	CONSTRAINT "servicio_duracion_positiva" CHECK ("servicio"."duracion_minutos" > 0)
);
--> statement-breakpoint
CREATE TABLE "usuario_admin" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuario_admin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario" text NOT NULL,
	"password_hash" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_admin_usuario_unico" UNIQUE("usuario")
);
--> statement-breakpoint
ALTER TABLE "bloqueo_agenda" ADD CONSTRAINT "bloqueo_agenda_maquilladora_id_maquilladora_id_fk" FOREIGN KEY ("maquilladora_id") REFERENCES "public"."maquilladora"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_trabajo" ADD CONSTRAINT "horario_trabajo_maquilladora_id_maquilladora_id_fk" FOREIGN KEY ("maquilladora_id") REFERENCES "public"."maquilladora"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueo_agenda_maquilladora_idx" ON "bloqueo_agenda" USING btree ("maquilladora_id");--> statement-breakpoint
CREATE INDEX "horario_trabajo_maquilladora_idx" ON "horario_trabajo" USING btree ("maquilladora_id");