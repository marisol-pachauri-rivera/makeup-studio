ALTER TABLE "reserva" ADD COLUMN "clave_idempotencia" uuid;--> statement-breakpoint
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_clave_idempotencia_unica" UNIQUE("clave_idempotencia");