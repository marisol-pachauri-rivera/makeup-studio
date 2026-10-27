CREATE TABLE "intento_login" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intento_login_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario" text NOT NULL,
	"intentado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "intento_login_usuario_instante_idx" ON "intento_login" USING btree ("usuario","intentado_en");