-- ============================================================
-- Migración inicial
-- Plataforma Transporte Público Urbano
-- ============================================================

-- ── Extensiones ──────────────────────────────────────────────

CREATE EXTENSION "pgcrypto";
CREATE EXTENSION "pg_trgm";


-- ── Tipos ENUM ────────────────────────────────────────────────

CREATE TYPE "UserRole" AS ENUM (
    'PASSENGER',
    'COMPANY',
    'ADMIN'
);

CREATE TYPE "BusStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'MAINTENANCE'
);

CREATE TYPE "ComplaintStatus" AS ENUM (
    'PENDING',
    'IN_REVIEW',
    'RESOLVED',
    'REJECTED'
);

CREATE TYPE "ComplaintCategory" AS ENUM (
    'DELAY',
    'OVERCROWDING',
    'DRIVER_BEHAVIOR',
    'VEHICLE_CONDITION',
    'ACCESSIBILITY',
    'OTHER'
);

CREATE TYPE "TripStatus" AS ENUM (
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


-- ============================================================
-- TABLA: companies
-- ============================================================

CREATE TABLE companies (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name       TEXT NOT NULL,
    rut        TEXT NOT NULL UNIQUE,
    address    TEXT,
    phone      TEXT,
    email      TEXT NOT NULL UNIQUE,
    "logoUrl"  TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLA: users
-- ============================================================

CREATE TABLE users (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    role           "UserRole" NOT NULL DEFAULT 'PASSENGER',
    "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "companyId"    TEXT REFERENCES companies(id) ON DELETE SET NULL
);


-- ============================================================
-- TABLA: routes
-- ============================================================

CREATE TABLE routes (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    description TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
);


-- ============================================================
-- TABLA: stops
-- ============================================================

CREATE TABLE stops (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name      TEXT NOT NULL,
    latitude  FLOAT8 NOT NULL,
    longitude FLOAT8 NOT NULL,
    "order"   INTEGER NOT NULL,
    "routeId" TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE
);


-- ============================================================
-- TABLA: buses
-- ============================================================

CREATE TABLE buses (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patente             TEXT NOT NULL UNIQUE,
    capacity            INTEGER NOT NULL DEFAULT 40,
    "currentPassengers" INTEGER NOT NULL DEFAULT 0,
    boardings           INTEGER NOT NULL DEFAULT 0,
    alightings          INTEGER NOT NULL DEFAULT 0,
    "schoolBoardings"   INTEGER NOT NULL DEFAULT 0,
    status              "BusStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastLatitude"      FLOAT8,
    "lastLongitude"     FLOAT8,
    "lastHeading"       FLOAT8,
    "lastSpeed"         FLOAT8,
    "lastLocationAt"    TIMESTAMPTZ,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "companyId"         TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    "routeId"           TEXT REFERENCES routes(id) ON DELETE SET NULL
);


-- ============================================================
-- TABLA: trips
-- ============================================================

CREATE TABLE trips (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "departureTime" TIMESTAMPTZ NOT NULL,
    "arrivalTime"   TIMESTAMPTZ,
    status          "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "busId"         TEXT NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
    "routeId"       TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT
);


-- ============================================================
-- TABLA: passenger_logs
-- ============================================================

CREATE TABLE passenger_logs (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    boardings    INTEGER NOT NULL DEFAULT 0,
    alightings   INTEGER NOT NULL DEFAULT 0,
    "isSchool"   BOOLEAN NOT NULL DEFAULT FALSE,
    "locationLat" FLOAT8,
    "locationLng" FLOAT8,
    "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "tripId"     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE
);


-- ============================================================
-- TABLA: complaints
-- ============================================================

CREATE TABLE complaints (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    category        "ComplaintCategory" NOT NULL DEFAULT 'OTHER',
    status          "ComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "adminResponse" TEXT,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "passengerId"   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "busId"         TEXT REFERENCES buses(id) ON DELETE SET NULL,
    "routeId"       TEXT REFERENCES routes(id) ON DELETE SET NULL,
    "companyId"     TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    "tripId"        TEXT REFERENCES trips(id) ON DELETE SET NULL
);


-- ============================================================
-- ÍNDICES
-- ============================================================

-- users
CREATE INDEX idx_users_company
    ON users("companyId");

CREATE INDEX idx_users_role
    ON users(role);

CREATE INDEX idx_users_email
    ON users(email);


-- routes
CREATE INDEX idx_routes_company
    ON routes("companyId");

CREATE INDEX idx_routes_code
    ON routes(code);


-- stops
CREATE INDEX idx_stops_route
    ON stops("routeId");


-- buses
CREATE INDEX idx_buses_company
    ON buses("companyId");

CREATE INDEX idx_buses_route
    ON buses("routeId");

CREATE INDEX idx_buses_status
    ON buses(status);


-- trips
CREATE INDEX idx_trips_bus
    ON trips("busId");

CREATE INDEX idx_trips_route
    ON trips("routeId");

CREATE INDEX idx_trips_status
    ON trips(status);

CREATE INDEX idx_trips_departure
    ON trips("departureTime");


-- passenger_logs
CREATE INDEX idx_passlogs_trip
    ON passenger_logs("tripId");

CREATE INDEX idx_passlogs_time
    ON passenger_logs("recordedAt");


-- complaints
CREATE INDEX idx_complaints_passenger
    ON complaints("passengerId");

CREATE INDEX idx_complaints_company
    ON complaints("companyId");

CREATE INDEX idx_complaints_status
    ON complaints(status);

CREATE INDEX idx_complaints_created
    ON complaints("createdAt" DESC);

CREATE INDEX idx_complaints_trip
    ON complaints("tripId");


-- ============================================================
-- FUNCIÓN: actualizar updatedAt
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_routes_updated_at
BEFORE UPDATE ON routes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_buses_updated_at
BEFORE UPDATE ON buses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_complaints_updated_at
BEFORE UPDATE ON complaints
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();