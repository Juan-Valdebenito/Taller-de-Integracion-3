# Clima DB migrations

`clima-db-init-scripts.yaml` solo inicializa una base con un directorio de datos vacío. Antes de desplegar la nueva versión de `clima_service` sobre una base existente, aplica la migración:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f kubernetes/services/clima_db/migrations/001_add_precipitation.sql
```

La migración es idempotente y conserva las lecturas existentes, que reciben `0 mm` porque no hay una medición histórica de precipitación.