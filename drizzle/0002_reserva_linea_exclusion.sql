-- Custom SQL migration file, put your code below! --
-- Drizzle no puede declarar restricciones EXCLUDE (ADR 0003 y ADR 0005), por eso va a mano.
-- Si una migración futura reconstruye "reserva_linea", debe repetir esta restricción.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- Una maquilladora no puede tener dos líneas activas solapadas. Rango semiabierto [inicio, fin):
-- turnos contiguos conviven. Las líneas inactivas no ocupan horario.
ALTER TABLE "reserva_linea" ADD CONSTRAINT "reserva_linea_sin_solapamiento"
  EXCLUDE USING gist ("maquilladora_id" WITH =, tstzrange("inicio", "fin", '[)') WITH &&)
  WHERE ("activa");
