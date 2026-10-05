-- Activar la extensión geoespacial PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. TABLA DE PARADEROS (NODOS)
CREATE TABLE IF NOT EXISTS stops (
    stop_id VARCHAR(50) PRIMARY KEY,
    stop_name VARCHAR(150) NOT NULL,
    -- Columna de geometría espacial (Punto GPS en WGS 84 / SRID 4326)
    location GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crear índice espacial para búsquedas ultrarrápidas por proximidad
CREATE INDEX IF NOT EXISTS idx_stops_location ON stops USING GIST(location);


-- 2. TABLA DE LÍNEAS DE MICRO
CREATE TABLE IF NOT EXISTS routes (
    route_id VARCHAR(20) PRIMARY KEY, -- ej: 'L1C', 'L7A'
    route_short_name VARCHAR(50) NOT NULL, -- ej: 'Línea 1C'
    route_long_name VARCHAR(150) NOT NULL, -- ej: 'Labranza - Cajón'
    color_hex VARCHAR(7) DEFAULT '#000000'
);


-- 3. TABLA DE RECORRIDOS / VARIANTES (Ida / Vuelta)
CREATE TABLE IF NOT EXISTS trips (
    trip_id VARCHAR(50) PRIMARY KEY, -- ej: 'L7A-IDA', 'L7A-VTA'
    route_id VARCHAR(20) NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('IDA', 'VUELTA')),
    -- Trazado geométrico completo de la calle que recorre la micro (LineString)
    route_shape GEOMETRY(LineString, 4326)
);


-- 4. TABLA DE CONEXIONES ENTRE PARADEROS (ARISTAS DEL GRAFO)
CREATE TABLE IF NOT EXISTS route_stops (
    trip_id VARCHAR(50) NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
    from_stop_id VARCHAR(50) NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
    to_stop_id VARCHAR(50) NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
    stop_sequence INT NOT NULL, -- Orden en el recorrido (1, 2, 3...)
    base_travel_time_seconds INT NOT NULL, -- Tiempo base estimado entre paraderos
    distance_meters INT NOT NULL, -- Distancia entre paraderos
    PRIMARY KEY (trip_id, from_stop_id, to_stop_id)
);


-- 5. TABLA DE TRANSBORDOS A PIE
CREATE TABLE IF NOT EXISTS transfers (
    from_stop_id VARCHAR(50) NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
    to_stop_id VARCHAR(50) NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
    walk_time_seconds INT NOT NULL,
    PRIMARY KEY (from_stop_id, to_stop_id)
);