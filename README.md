# 🚌 TransitHub — Plataforma de Transporte Público Urbano

Sistema integral de monitoreo, gestión y transparencia del transporte público urbano.

---

## 🏗️ Arquitectura

Monorepo con **Clean Architecture** en ambas capas:

```
Taller-de-Integracion-3/
├── frontend/    # React 18 + Vite + TypeScript
└── backend/     # Node.js + Express + TypeScript + Prisma + PostgreSQL
```

### Capas (ambos proyectos)

| Capa | Backend | Frontend |
|------|---------|----------|
| **Dominio** | `domain/entities/`, `domain/repositories/` | `core/domain/` |
| **Aplicación** | `application/use-cases/` | `core/use-cases/` |
| **Infraestructura** | `infrastructure/database/`, `infrastructure/http/` | `infrastructure/api/`, `infrastructure/socket/` |
| **Presentación** | — | `presentation/` (React) |

---

## 🚀 Inicio rápido

### Prerrequisitos

- Node.js 18+
- PostgreSQL (corriendo localmente o en Docker)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
# Backend
cp backend/.env.example backend/.env
# Edita backend/.env con tu DATABASE_URL y JWT_SECRET
```

### 3. Inicializar base de datos

```bash
cd backend
npm run db:generate    # Genera el cliente Prisma
npm run db:migrate     # Ejecuta las migraciones
```

### 4. Iniciar en modo desarrollo

```bash
# Desde la raíz (inicia ambos)
npm run dev

# O por separado:
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173
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

Base: `http://localhost:3001/api/v1`

| Recurso | Método | Endpoint |
|---------|--------|----------|
| Auth | POST | `/auth/login`, `/auth/register` |
| Usuarios | GET/PUT/DELETE | `/users`, `/users/:id` |
| Micros | GET/POST/PUT/DELETE | `/buses`, `/buses/:id` |
| Rutas | GET/POST/PUT/DELETE | `/routes`, `/routes/:id` |
| Reclamos | GET/POST/PUT | `/complaints` |

---

## 🔌 WebSocket (Socket.io)

| Evento (cliente → servidor) | Descripción |
|-----------------------------|-------------|
| `route:join` | Unirse a la sala de una ruta |
| `route:leave` | Salir de la sala de una ruta |
| `bus:location:update` | Actualizar ubicación de micro |
| `bus:passengers:update` | Actualizar pasajeros |

| Evento (servidor → cliente) | Descripción |
|-----------------------------|-------------|
| `bus:location:broadcast` | Difundir ubicación actualizada |
| `bus:status:broadcast` | Difundir estado actualizado |

---

## 🛠️ Stack tecnológico

| Área | Tecnología |
|------|-----------|
| Frontend | React 18, Vite, TypeScript, React Router v6 |
| Backend | Express, TypeScript, Socket.io |
| Base de datos | PostgreSQL + Prisma ORM |
| Autenticación | JWT |
| Tiempo real | Socket.io |
| Monorepo | npm workspaces |
