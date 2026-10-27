CREATE TABLE "reserva" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reserva_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"nombre_contacto" text NOT NULL,
	"telefono_contacto" text NOT NULL,
	"estado" text DEFAULT 'pendiente_pago' NOT NULL,
	"numero_operacion" text,
	"monto_total" numeric(10, 2) NOT NULL,
	"estado_reembolso" text DEFAULT 'no_aplica' NOT NULL,
	"motivo_rechazo" text,
	"motivo_cancelacion" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"validada_en" timestamp with time zone,
	CONSTRAINT "reserva_token_unico" UNIQUE("token"),
	CONSTRAINT "reserva_numero_operacion_unico" UNIQUE("numero_operacion"),
	CONSTRAINT "reserva_estado_valido" CHECK ("reserva"."estado" in ('pendiente_pago', 'pendiente_validacion', 'confirmada', 'cancelada')),
	CONSTRAINT "reserva_reembolso_valido" CHECK ("reserva"."estado_reembolso" in ('no_aplica', 'pendiente', 'realizado')),
	CONSTRAINT "reserva_motivo_cancelacion_valido" CHECK ("reserva"."motivo_cancelacion" is null or "reserva"."motivo_cancelacion" in ('vencida', 'clienta', 'studio')),
	CONSTRAINT "reserva_monto_no_negativo" CHECK ("reserva"."monto_total" >= 0),
	CONSTRAINT "reserva_estado_numero_coherente" CHECK (("reserva"."estado" = 'pendiente_pago' and "reserva"."numero_operacion" is null)
        or ("reserva"."estado" in ('pendiente_validacion', 'confirmada') and "reserva"."numero_operacion" is not null)
        or "reserva"."estado" = 'cancelada'),
	CONSTRAINT "reserva_cancelacion_coherente" CHECK (("reserva"."estado" = 'cancelada') = ("reserva"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
CREATE TABLE "reserva_linea" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reserva_linea_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reserva_id" integer NOT NULL,
	"persona" text NOT NULL,
	"servicio_id" integer NOT NULL,
	"maquilladora_id" integer NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"precio" numeric(10, 2) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reserva_linea_fin_posterior" CHECK ("reserva_linea"."fin" > "reserva_linea"."inicio"),
	CONSTRAINT "reserva_linea_precio_no_negativo" CHECK ("reserva_linea"."precio" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reserva_linea" ADD CONSTRAINT "reserva_linea_reserva_id_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reserva"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva_linea" ADD CONSTRAINT "reserva_linea_servicio_id_servicio_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicio"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva_linea" ADD CONSTRAINT "reserva_linea_maquilladora_id_maquilladora_id_fk" FOREIGN KEY ("maquilladora_id") REFERENCES "public"."maquilladora"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserva_linea_reserva_idx" ON "reserva_linea" USING btree ("reserva_id");