# 🚌 TransitHub — Plataforma de Transporte Público Urbano

Sistema integral de monitoreo, gestión y transparencia del transporte público urbano.

---

## 🏗️ Arquitectura

Monorepo con **Clean Architecture**:

```
Taller-de-Integracion-3/
├── frontend/      # React 18 + Vite + TypeScript
├── backend/       # Node.js + Express + TypeScript + Prisma (referencia original)
└── backend-go/    # ✅ Go + Gin + pgx + PostgreSQL (backend activo)
```

### Capas del Backend Go

| Paquete | Responsabilidad |
|---------|----------------|
| `internal/config` | Carga de variables de entorno |
| `internal/db` | Pool de conexiones PostgreSQL (pgxpool) |
| `internal/domain` | Structs y enums del dominio |
| `internal/repository` | Queries SQL directas con pgx |
| `internal/handler` | Handlers HTTP (Gin) |
| `internal/middleware` | JWT auth + autorización por roles |
| `internal/router` | Registro de rutas y grupos |
| `cmd/server` | Punto de entrada (`main.go`) |

---

## 🚀 Inicio rápido — Backend Go

### Prerrequisitos

- [Go 1.22+](https://go.dev/dl/)
- PostgreSQL corriendo localmente

### 1. Inicializar la base de datos

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE transporte_db;"

# Ejecutar el script SQL completo
psql -U postgres -d transporte_db -f database_setup.sql
```

### 2. Configurar variables de entorno

```bash
cd backend-go
cp .env.example .env
# Edita .env si tus credenciales de PostgreSQL son distintas
```

### 3. Descargar dependencias

```bash
cd backend-go
go mod tidy
```

### 4. Ejecutar el servidor Go

```bash
# Desde backend-go
cd backend-go
go run ./cmd/server
# Servidor en http://localhost:3001
```

### 5. Ejecutar el frontend (en otra terminal)

```bash
npm run dev:frontend
# http://localhost:5173
```

---

## 🚀 Inicio rápido — Frontend (solo)

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

> En PowerShell, usa `npm.cmd` si aparece el error de que `npm.ps1` no puede
> ejecutarse por la politica de scripts.

---

## 👥 Roles del sistema

| Rol | Acceso | URL |
|-----|--------|-----|
| **Pasajero** | Mapa en tiempo real, reclamos | `/passenger` |
| **Empresa** | Dashboard flota, rutas, reclamos | `/company` |
| **Administrador** | Gestión global | `/admin` |

---

## 📡 API REST

Base URL: `http://localhost:3001/api/v1`

| Recurso | Método | Endpoint | Roles |
|---------|--------|----------|-------|
| Health | GET | `/health` | Público |
| Auth | POST | `/auth/register` | Público |
| Auth | POST | `/auth/login` | Público |
| Auth | POST | `/auth/logout` | Público |
| Auth | GET | `/auth/me` | Autenticado |
| Usuarios | GET | `/users` | ADMIN |
| Usuarios | GET | `/users/:id` | Autenticado |
| Usuarios | PUT | `/users/:id` | ADMIN |
| Usuarios | DELETE | `/users/:id` | ADMIN |
| Buses | GET | `/buses?routeId=` | Autenticado |
| Buses | GET | `/buses/:id` | Autenticado |
| Buses | GET | `/buses/:id/location` | Autenticado |
| Buses | POST | `/buses` | ADMIN, COMPANY |
| Buses | PUT | `/buses/:id` | ADMIN, COMPANY |
| Buses | DELETE | `/buses/:id` | ADMIN |
| Rutas | GET | `/routes` | Autenticado |
| Rutas | GET | `/routes/:id` | Autenticado |
| Rutas | GET | `/routes/:id/stops` | Autenticado |
| Rutas | GET | `/routes/:id/buses` | Autenticado |
| Rutas | POST | `/routes` | ADMIN |
| Rutas | PUT | `/routes/:id` | ADMIN, COMPANY |
| Rutas | DELETE | `/routes/:id` | ADMIN |
| Reclamos | GET | `/complaints` | ADMIN, COMPANY |
| Reclamos | GET | `/complaints/:id` | Autenticado |
| Reclamos | POST | `/complaints` | PASSENGER |
| Reclamos | PUT | `/complaints/:id/status` | ADMIN, COMPANY |
| Reclamos | DELETE | `/complaints/:id` | ADMIN |

### Autenticación

Todos los endpoints protegidos requieren el header:
```
Authorization: Bearer <token>
```

El token se obtiene desde `POST /auth/login` o `POST /auth/register`.

---

## 🛠️ Stack tecnológico

| Área | Tecnología |
|------|-----------|
| Frontend | React 18, Vite, TypeScript, React Router v6 |
| Backend | **Go 1.22, Gin, pgx v5** |
| Base de datos | **PostgreSQL** |
| Autenticación | **JWT (golang-jwt/jwt)** |
| Hash contraseñas | **bcrypt (golang.org/x/crypto)** |
| Tiempo real | Socket.IO (backend TS - pendiente migración) |
| Monorepo | npm workspaces (frontend) |

## 🔌 Integración gRPC

La comunicación interna entre `backend-go`, `clima_service` y `micro_service` usa gRPC. Los listeners gRPC son `9090` para clima y `9091` para transporte; los listeners HTTP existentes se mantienen para compatibilidad.

Los stubs compartidos están en `proto/gen/go`. Para regenerarlos desde la raíz del repositorio, instala `protoc`, `protoc-gen-go` y `protoc-gen-go-grpc`, y ejecuta:

```bash
mkdir -p proto/gen/go/clima/v1 proto/gen/go/micro/v1
protoc -I proto -I /path/to/protoc/include \
  --go_out=proto/gen/go/clima/v1 --go_opt=paths=source_relative \
  --go-grpc_out=proto/gen/go/clima/v1 --go-grpc_opt=paths=source_relative \
  proto/clima_service.proto
protoc -I proto -I /path/to/protoc/include \
  --go_out=proto/gen/go/micro/v1 --go_opt=paths=source_relative \
  --go-grpc_out=proto/gen/go/micro/v1 --go-grpc_opt=paths=source_relative \
  proto/micro_service.proto
```

`backend-go` expone proxies REST autenticados que llaman a gRPC:

- `GET /api/v1/integrations/climate/telemetry?from=...&to=...`
- `GET /api/v1/integrations/micro/stops`
- `GET /api/v1/integrations/micro/stops/:id`
- `GET /api/v1/integrations/micro/routes`
- `GET /api/v1/integrations/micro/routes/plan?from_stop=...&to_stop=...&preference=fastest`

Variables de `backend-go`: `CLIMATE_GRPC_TARGET`, `CLIMATE_API_KEY`, `MICRO_GRPC_TARGET`, `MICRO_API_KEY` y `GRPC_TIMEOUT`. Las rutas existentes `/api/v1/routes` continúan usando `transporte_db` y no fueron migradas.

Los Dockerfiles de los microservicios requieren contexto de build en la raíz:

```bash
docker build -f kubernetes/services/clima_service/Dockerfile .
docker build -f kubernetes/services/micro_service/Dockerfile .
```

---

## 🔌 WebSocket (Socket.io) — Backend TypeScript (referencia)

> El backend Go actualmente no implementa WebSockets.
> El backend TypeScript en `backend/` tiene la implementación de referencia.

| Evento (cliente → servidor) | Descripción |
|-----------------------------|-------------|
| `route:join` | Unirse a la sala de una ruta |
| `route:leave` | Salir de la sala de una ruta |
| `bus:location:update` | Actualizar ubicación de micro |
| `bus:passengers:update` | Actualizar pasajeros |
