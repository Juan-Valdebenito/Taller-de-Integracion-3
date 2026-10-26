-- ============================================================
-- Iguala el esquema de las migraciones con database_setup.sql
-- ============================================================
--
-- La 000001 se escribió antes de que database_setup.sql y el código sumaran
-- la valoración y la línea en los reclamos, la categoría FARES_PAYMENT y la
-- tabla de recaudo. Todo es idempotente (IF NOT EXISTS): en una base creada
-- con database_setup.sql no cambia nada; en una creada con las migraciones
-- agrega lo que falta.

ALTER TYPE "ComplaintCategory" ADD VALUE IF NOT EXISTS 'FARES_PAYMENT' BEFORE 'VEHICLE_CONDITION';

-- ── Reclamos: valoración (1 a 5) y línea de la micro ────────────────────────
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS rating INT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "lineName" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'complaints'::regclass AND conname = 'complaints_rating_check'
  ) THEN
    ALTER TABLE complaints
      ADD CONSTRAINT complaints_rating_check CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_complaints_rating   ON complaints(rating);
CREATE INDEX IF NOT EXISTS idx_complaints_linename ON complaints("lineName");

-- ── Recaudo (cobro Bipay / Escolar / Adulto Mayor) ──────────────────────────
CREATE TABLE IF NOT EXISTS recaudo_transactions (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "busId"     TEXT        NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  "cardUid"   TEXT        NOT NULL,
  "fareType"  TEXT        NOT NULL,
  amount      INTEGER     NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'APPROVED',
  "routeId"   TEXT        REFERENCES routes(id) ON DELETE SET NULL,
  "tripId"    TEXT        REFERENCES trips(id) ON DELETE SET NULL,
  latitude    FLOAT8,
  longitude   FLOAT8,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recaudo_bus      ON recaudo_transactions("busId");
CREATE INDEX IF NOT EXISTS idx_recaudo_faretype ON recaudo_transactions("fareType");
CREATE INDEX IF NOT EXISTS idx_recaudo_created  ON recaudo_transactions("createdAt" DESC);
