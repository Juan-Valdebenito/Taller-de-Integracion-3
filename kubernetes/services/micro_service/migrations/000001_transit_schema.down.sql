-- Revierte 000001. Ojo: borra toda la red CON SUS DATOS, también en una base creada
-- con los scripts iniciales. No quita PostGIS, porque otros podrían usarlo.

DROP TABLE IF EXISTS transfers;
DROP TABLE IF EXISTS route_stops;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS stops;
