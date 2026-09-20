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

## Almacenamiento

`clima-db.yml` usa `emptyDir` porque el entorno actual no permite asumir un PVC. Cualquier recreación del Pod de TimescaleDB elimina los datos. Antes de usar históricos reales, reemplazar ese volumen por un `PersistentVolumeClaim` si es que se puede y cambiar el despliegue de base a una estrategia apropiada para almacenamiento persistente.
