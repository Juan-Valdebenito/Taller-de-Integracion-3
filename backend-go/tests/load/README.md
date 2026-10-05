# Script de Pruebas de Carga — API REST Go

Script de load/stress testing para la API REST Go usando la libreria [`vegeta`](https://github.com/tsenart/vegeta).

## Requisitos

- Go 1.22+
- El servidor debe estar corriendo (`go run ./cmd/server/`)
- Un usuario valido en la base de datos (para endpoints autenticados)

## Instalacion de dependencia

```bash
cd backend-go
go get github.com/tsenart/vegeta/v12
```

## Uso

### Modo completo (publico + autenticado)

```bash
go run ./tests/load/cmd/ \
  --base-url=http://localhost:3001 \
  --email=admin@test.com \
  --password=tu_password
```

### Solo endpoints publicos (sin BD requerida)

```bash
go run ./tests/load/cmd/ \
  --base-url=http://localhost:3001 \
  --public-only
```

### Fases personalizadas

```bash
go run ./tests/load/cmd/ \
  --base-url=http://localhost:3001 \
  --email=admin@test.com \
  --password=secret \
  --phases="10:15,50:30,100:20,200:15,20:10" \
  --output=./resultados
```

### Todas las opciones disponibles

| Flag | Default | Descripcion |
|------|---------|-------------|
| `--base-url` | `http://localhost:3001` | URL base del servidor |
| `--email` | (requerido) | Email para login |
| `--password` | (requerido) | Contrasena |
| `--public-only` | `false` | Solo endpoints publicos |
| `--phases` | ver abajo | Fases custom: `rate:seg,...` |
| `--workers` | `10` | Workers concurrentes de vegeta |
| `--timeout` | `30s` | Timeout por request |
| `--output` | `.` | Directorio de salida de reportes |

## Fases por defecto

| # | Nombre | Rate | Duracion |
|---|--------|------|----------|
| 1 | Warm-up | 10 req/s | 15s |
| 2 | Carga normal | 50 req/s | 30s |
| 3 | Pico | 100 req/s | 20s |
| 4 | Estres | 200 req/s | 15s |
| 5 | Cool-down | 20 req/s | 10s |

## Endpoints cubiertos

| Endpoint | Metodo | Auth |
|----------|--------|------|
| `/health` | GET | No |
| `/api/v1/occupancy` | POST | No |
| `/api/v1/auth/login` | POST | No |
| `/api/v1/auth/me` | GET | JWT |
| `/api/v1/buses/` | GET | JWT |
| `/api/v1/routes/` | GET | JWT |
| `/api/v1/complaints/` | GET | JWT (ADMIN/COMPANY) |
| `/api/v1/users/` | GET | JWT (ADMIN) |

## Metricas reportadas

- **Success rate**: % de respuestas 2xx
- **p50/p95/p99**: latencias en percentil 50, 95 y 99
- **Latencia maxima**: peor caso absoluto
- **RPS real**: requests por segundo efectivos
- **Throughput**: KB/s recibidos
- **Status codes**: distribucion de codigos HTTP
- **Errores de red**: timeouts, connection refused, etc.

## Archivos de salida

Despues de ejecutar, se generan en el directorio `--output`:

- `load_report.json` — Reporte completo en JSON (por fase + totales)
- `load_report.csv` — Tabla de metricas por fase (importable en Excel)

## Interpretacion de resultados

| Metrica | Bueno | Aceptable | Critico |
|---------|-------|-----------|---------|
| Success rate | >= 99% | >= 95% | < 95% |
| p95 latencia | < 200ms | < 500ms | > 500ms |
| p99 latencia | < 500ms | < 1000ms | > 1000ms |
