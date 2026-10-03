# micro_telemetry

Servicio HTTP que recibe telemetría de micros desde sensores GPS y cámaras de conteo de pasajeros.

## Endpoints

Todos los endpoints de ingesta requieren el header `X-API-Key`.

- `POST /api/v1/telemetry/gps`
- `POST /api/v1/telemetry/passengers`
- `GET /health`
- `GET /ready`

Los aliases `/telemetry/gps` y `/telemetry/passengers` también están disponibles para productores internos.

## Payloads

GPS:

```json
{
  "event_id": "gps-B-7B-01-0001",
  "bus_id": "B-7B-01",
  "route_id": "7B",
  "latitude": -38.7397,
  "longitude": -72.5984,
  "heading": 90,
  "speed_kmh": 25.4,
  "timestamp": "2026-10-03T12:00:00Z"
}
```

Pasajeros:

```json
{
  "event_id": "passengers-B-7B-01-0001",
  "bus_id": "B-7B-01",
  "route_id": "7B",
  "current_passengers": 18,
  "capacity": 35,
  "boardings": 2,
  "alightings": 1,
  "timestamp": "2026-10-03T12:00:01Z"
}
```

Cada lectura se guarda en su histórico y actualiza el estado de `bus_id` solo si es más nueva que la lectura del mismo sensor. La respuesta publicada en `transport.micro.telemetry.state` contiene el último valor conocido de GPS y pasajeros; por eso sus campos son opcionales cuando aún no llegó uno de los sensores.

## Configuración

La configuración de ejecución está en `micro-telemetry-configmap.yaml` y los secretos de ejemplo en `micro-telemetry-secrets.yaml`. En producción, reemplaza los valores de `stringData` antes de aplicar los recursos.

La base de datos usa `micro-telemetry-db.yml` y el esquema de `micro-telemetry-db-init-scripts.yaml`. Como las bases actuales del proyecto usan `emptyDir`, este despliegue también debe recibir un volumen persistente antes de considerarse productivo.