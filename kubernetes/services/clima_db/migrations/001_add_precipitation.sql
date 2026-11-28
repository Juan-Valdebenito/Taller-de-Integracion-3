BEGIN;

ALTER TABLE weather_telemetry
    ADD COLUMN IF NOT EXISTS precipitation_mm DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (precipitation_mm >= 0);

ALTER TABLE weather_telemetry
    ALTER COLUMN precipitation_mm DROP DEFAULT;

COMMIT;