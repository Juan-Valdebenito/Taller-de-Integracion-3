-- Insertar Paraderos de Prueba
INSERT INTO stops (stop_id, stop_name, location) VALUES
('PAR-UFRO-01', 'Av. Las Encinas / Campus UFRO', ST_SetSRID(ST_MakePoint(-72.6162, -38.7481), 4326)),
('PAR-ALEM-01', 'Av. Alemania / Portal Temuco', ST_SetSRID(ST_MakePoint(-72.6025, -38.7362), 4326)),
('PAR-CENTRO-01', 'Plaza de Armas / Bulnes', ST_SetSRID(ST_MakePoint(-72.5903, -38.7391), 4326));

-- Insertar Línea de Micro
INSERT INTO routes (route_id, route_short_name, route_long_name, color_hex) VALUES
('L7A', 'Línea 7A', 'El Carmen - Av. Alemania - Cajón', '#FF5733');

-- Insertar Recorrido (Trip)
INSERT INTO trips (trip_id, route_id, direction) VALUES
('L7A-IDA', 'L7A', 'IDA');

-- Insertar Tramos/Conexiones
INSERT INTO route_stops (trip_id, from_stop_id, to_stop_id, stop_sequence, base_travel_time_seconds, distance_meters) VALUES
('L7A-IDA', 'PAR-UFRO-01', 'PAR-ALEM-01', 1, 300, 1800), -- 5 mins, 1.8 km
('L7A-IDA', 'PAR-ALEM-01', 'PAR-CENTRO-01', 2, 240, 1400); -- 4 mins, 1.4 km