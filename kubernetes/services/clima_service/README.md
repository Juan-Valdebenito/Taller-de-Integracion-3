# Despliegue del servicio climático

Los manifiestos están separados para aplicar primero la base, luego el receptor y finalmente el simulador.

## Imágenes

Construir y publicar las imagenes para el servicio y el simulador

## Kubernetes

```bash
kubectl apply -f kubernetes/services/clima_db/clima-db-init-scripts.yaml
kubectl apply -f kubernetes/services/clima_db/clima-db.yml
kubectl apply -f kubernetes/services/clima_service/clima-configmap.yaml
kubectl apply -f kubernetes/services/clima_service/clima-deployment.yaml
kubectl apply -f kubernetes/services/clima_simulator/clima-simulator-deployment.yaml
```

El simulador se despliega con una sola réplica y ejecuta las estaciones como goroutines. No se debe escalar ese Deployment sin dividir la configuración por estación, porque cada réplica produciría lecturas duplicadas.

## Verificación operativa

```bash
kubectl  get pods,svc
kubectl  logs clima-service
kubectl  logs clima-simulator
```

Para probar el receptor desde dentro del clúster, enviar un JSON al Service `clima-service-svc` con el header `X-API-Key`. Las filas se pueden consultar conectándose a `clima-db-svc`, base `climate_db`, tabla `weather_telemetry`.

## Consulta de telemetría

El endpoint `GET /api/v1/telemetry/weather` entrega lecturas crudas para servicios de análisis y machine learning. Requiere el header `X-API-Key` y los parámetros `from` y `to` en formato RFC3339. El intervalo es `[from, to)`, por lo que incluye `from` y excluye `to`.

Parámetros opcionales:

- `station_id`: filtra por estación.
- `limit`: cantidad de filas, por defecto `500` y con un máximo de `1000`.

Ejemplo:

```bash
curl -H "X-API-Key: <WEATHER_API_KEY>" \
	"http://clima-service-svc:8080/api/v1/telemetry/weather?from=2026-09-26T00:00:00Z&to=2026-09-27T00:00:00Z&limit=500"
```

La respuesta contiene `data`, `limit` y `next_cursor`. Cada fila incluye timestamp UTC, estación, sector, métricas con sus unidades del esquema (`temperature_c`, `humidity_pct`, `wind_speed_kmh`, `pm25_ug_m3`, `pm10_ug_m3`) y coordenadas `latitude`/`longitude`. `next_cursor` es actualmente `null`; el endpoint no calcula costos dinámicos ni relaciona estaciones con aristas del grafo.

## Almacenamiento

`clima-db.yml` usa `emptyDir` porque el entorno actual no permite asumir un PVC. Cualquier recreación del Pod de TimescaleDB elimina los datos. Antes de usar históricos reales, reemplazar ese volumen por un `PersistentVolumeClaim` si es que se puede y cambiar el despliegue de base a una estrategia apropiada para almacenamiento persistente.
