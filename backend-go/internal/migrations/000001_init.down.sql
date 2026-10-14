-- ============================================================
-- Rollback migración inicial
-- ============================================================

-- ── Eliminar triggers ────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_routes_updated_at ON routes;
DROP TRIGGER IF EXISTS trg_buses_updated_at ON buses;
DROP TRIGGER IF EXISTS trg_trips_updated_at ON trips;
DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;


-- ── Eliminar función ─────────────────────────────────────────

DROP FUNCTION IF EXISTS update_updated_at_column();


-- ── Eliminar tablas ──────────────────────────────────────────
--
-- Se eliminan primero las tablas que tienen dependencias
-- y luego las tablas padre.

DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS passenger_logs;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS buses;
DROP TABLE IF EXISTS stops;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;


-- ── Eliminar ENUMs ───────────────────────────────────────────

DROP TYPE IF EXISTS "TripStatus";
DROP TYPE IF EXISTS "ComplaintCategory";
DROP TYPE IF EXISTS "ComplaintStatus";
DROP TYPE IF EXISTS "BusStatus";
DROP TYPE IF EXISTS "UserRole";


-- ── Eliminar extensiones ─────────────────────────────────────
--
-- Solo hacerlo si estas extensiones son utilizadas
-- exclusivamente por esta aplicación.

DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "pgcrypto";