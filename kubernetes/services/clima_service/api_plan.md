# Servicio de clima

El servicio recibe telemetría de estaciones climáticas y la almacena en TimescaleDB. La publicación en un bus pub/sub queda reservada para una futura integración.

## Telemetría

`POST /api/v1/telemetry/weather`

Headers:

- `Content-Type: application/json`
- `X-API-Key: <clave configurada>`

El cuerpo puede ser una lectura o un arreglo no vacío de lecturas. Los campos de la lectura son `station_id`, `location`, `sensor_readings`, `status` y `timestamp`.

Respuestas:

- `202 Accepted`: lecturas validadas y guardadas.
- `400 Bad Request`: JSON, batch, timestamp, coordenadas o métricas inválidas.
- `401 Unauthorized`: API key ausente o incorrecta.
- `413 Request Entity Too Large`: cuerpo mayor a `MAX_BODY_BYTES`.
- `503 Service Unavailable`: la base de datos no está disponible o falló la transacción.

La inserción de un batch es transaccional: si una lectura falla, no se guarda ninguna lectura del batch.

## Salud

- `GET /health`: confirma que el proceso está vivo.
- `GET /ready`: confirma que el proceso puede alcanzar la base de datos.

## Configuración

| Variable | Predeterminado | Descripción |
| --- | --- | --- |
| `PORT` | `8080` | Puerto HTTP |
| `WEATHER_API_KEY` | `temuco_weather_secret_key` | Clave del header `X-API-Key` |
| `DB_HOST` | `localhost` | Host PostgreSQL/TimescaleDB |
| `DB_PORT` | `5432` | Puerto PostgreSQL |
| `DB_NAME` | `climate_db` | Base de datos |
| `DB_USER` | `climate_user` | Usuario |
| `DB_PASSWORD` | `climate_pass` | Contraseña |
| `DB_SSLMODE` | `disable` | Modo SSL de PostgreSQL |
| `MAX_BODY_BYTES` | `1048576` | Tamaño máximo del cuerpo |

## Persistencia

La tabla `weather_telemetry` es una hypertable TimescaleDB y almacena la ubicación como `GEOMETRY(Point, 4326)`. El timestamp recibido se guarda como `TIMESTAMPTZ`; no se aceptan timestamps futuros más de cinco minutos.

El despliegue de laboratorio usa `emptyDir` para la base de datos. Esto significa que el histórico se pierde al recrear el Pod. Antes de producción debe reemplazarse por un PVC o almacenamiento administrado.
