-- Revierte 000003. Ojo: borra la tabla de recaudo y la valoración/línea de los
-- reclamos CON SUS DATOS, también en una base creada con database_setup.sql.
-- PostgreSQL no permite quitar un valor de un ENUM: FARES_PAYMENT se queda.

DROP TABLE IF EXISTS recaudo_transactions;

DROP INDEX IF EXISTS idx_complaints_linename;
DROP INDEX IF EXISTS idx_complaints_rating;
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_rating_check;
ALTER TABLE complaints DROP COLUMN IF EXISTS "lineName";
ALTER TABLE complaints DROP COLUMN IF EXISTS rating;
