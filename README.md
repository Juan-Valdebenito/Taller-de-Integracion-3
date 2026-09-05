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
cd backend-go
go run ./cmd/server/...
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
npm install
npm run dev:frontend
```

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
