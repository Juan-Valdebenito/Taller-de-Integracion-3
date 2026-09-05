-- ============================================================
-- Script SQL Completo - Plataforma Transporte Público Urbano
-- ============================================================
-- Alternativa a "prisma migrate dev" si prefieres ejecutar
-- directamente en psql / pgAdmin / DBeaver.
--
-- Uso:
--   psql -U postgres -d transporte_db -f database_setup.sql
-- ============================================================

-- Habilitar extensiones útiles
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- búsquedas de texto por similitud

-- ── Tipos ENUM ────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "UserRole"          AS ENUM ('PASSENGER', 'COMPANY', 'ADMIN');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BusStatus"         AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintStatus"   AS ENUM ('PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintCategory" AS ENUM (
    'DELAY', 'OVERCROWDING', 'DRIVER_BEHAVIOR',
    'VEHICLE_CONDITION', 'ACCESSIBILITY', 'OTHER'
  );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabla: companies ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name       TEXT        NOT NULL,
  rut        TEXT        NOT NULL UNIQUE,
  address    TEXT,
  phone      TEXT,
  email      TEXT        NOT NULL UNIQUE,
  "logoUrl"  TEXT,
  "isActive" BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tabla: users ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL UNIQUE,
  "passwordHash" TEXT        NOT NULL,
  role           "UserRole"  NOT NULL DEFAULT 'PASSENGER',
  "isActive"     BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "companyId"    TEXT        REFERENCES companies(id) ON DELETE SET NULL
);

-- ── Tabla: routes ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routes (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL UNIQUE,
  description TEXT,
  "isActive"  BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "companyId" TEXT        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
);

-- ── Tabla: stops ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stops (
  id        TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name      TEXT    NOT NULL,
  latitude  FLOAT8  NOT NULL,
  longitude FLOAT8  NOT NULL,
  "order"   INTEGER NOT NULL,
  "routeId" TEXT    NOT NULL REFERENCES routes(id) ON DELETE CASCADE
);

-- ── Tabla: buses ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buses (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  patente             TEXT        NOT NULL UNIQUE,
  capacity            INTEGER     NOT NULL DEFAULT 40,
  "currentPassengers" INTEGER     NOT NULL DEFAULT 0,
  boardings           INTEGER     NOT NULL DEFAULT 0,
  alightings          INTEGER     NOT NULL DEFAULT 0,
  "schoolBoardings"   INTEGER     NOT NULL DEFAULT 0,
  status              "BusStatus" NOT NULL DEFAULT 'INACTIVE',
  "lastLatitude"      FLOAT8,
  "lastLongitude"     FLOAT8,
  "lastHeading"       FLOAT8,
  "lastSpeed"         FLOAT8,
  "lastLocationAt"    TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "companyId"         TEXT        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "routeId"           TEXT        REFERENCES routes(id) ON DELETE SET NULL
);

-- ── Tabla: trips ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trips (
  id              TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "departureTime" TIMESTAMPTZ  NOT NULL,
  "arrivalTime"   TIMESTAMPTZ,
  status          "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "busId"         TEXT         NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
  "routeId"       TEXT         NOT NULL REFERENCES routes(id) ON DELETE RESTRICT
);

-- ── Tabla: passenger_logs ────────────────────────────────────

CREATE TABLE IF NOT EXISTS passenger_logs (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  boardings    INTEGER     NOT NULL DEFAULT 0,
  alightings   INTEGER     NOT NULL DEFAULT 0,
  "isSchool"   BOOLEAN     NOT NULL DEFAULT FALSE,
  "locationLat" FLOAT8,
  "locationLng" FLOAT8,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "tripId"     TEXT        NOT NULL REFERENCES trips(id) ON DELETE CASCADE
);

-- ── Tabla: complaints ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS complaints (
  id              TEXT                 PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  title           TEXT                 NOT NULL,
  description     TEXT                 NOT NULL,
  category        "ComplaintCategory"  NOT NULL DEFAULT 'OTHER',
  status          "ComplaintStatus"    NOT NULL DEFAULT 'PENDING',
  "adminResponse" TEXT,
  "createdAt"     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "passengerId"   TEXT                 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "busId"         TEXT                 REFERENCES buses(id) ON DELETE SET NULL,
  "routeId"       TEXT                 REFERENCES routes(id) ON DELETE SET NULL,
  "companyId"     TEXT                 NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "tripId"        TEXT                 REFERENCES trips(id) ON DELETE SET NULL
);

-- ── Índices de rendimiento ───────────────────────────────────

-- users
CREATE INDEX IF NOT EXISTS idx_users_company   ON users("companyId");
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);

-- routes
CREATE INDEX IF NOT EXISTS idx_routes_company  ON routes("companyId");
CREATE INDEX IF NOT EXISTS idx_routes_code     ON routes(code);

-- stops
CREATE INDEX IF NOT EXISTS idx_stops_route     ON stops("routeId");

-- buses
CREATE INDEX IF NOT EXISTS idx_buses_company   ON buses("companyId");
CREATE INDEX IF NOT EXISTS idx_buses_route     ON buses("routeId");
CREATE INDEX IF NOT EXISTS idx_buses_status    ON buses(status);

-- trips
CREATE INDEX IF NOT EXISTS idx_trips_bus       ON trips("busId");
CREATE INDEX IF NOT EXISTS idx_trips_route     ON trips("routeId");
CREATE INDEX IF NOT EXISTS idx_trips_status    ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_departure ON trips("departureTime");

-- passenger_logs
CREATE INDEX IF NOT EXISTS idx_passlogs_trip   ON passenger_logs("tripId");
CREATE INDEX IF NOT EXISTS idx_passlogs_time   ON passenger_logs("recordedAt");

-- complaints
CREATE INDEX IF NOT EXISTS idx_complaints_passenger ON complaints("passengerId");
CREATE INDEX IF NOT EXISTS idx_complaints_company   ON complaints("companyId");
CREATE INDEX IF NOT EXISTS idx_complaints_status    ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created   ON complaints("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_trip      ON complaints("tripId");

-- ── Función trigger para actualizar updatedAt ────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas con updatedAt
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','users','routes','buses','trips','complaints']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- Script completado exitosamente
-- ============================================================
