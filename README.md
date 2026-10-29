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

El backend Go utiliza **golang-migrate** para ejecutar automáticamente las migraciones pendientes al iniciar el servicio.

Solo es necesario crear la base de datos PostgreSQL:

```bash
psql -U postgres -c "CREATE DATABASE transporte_db;"
```

### 2. Configurar variables de entorno

```bash
cd backend-go
cp .env.example .env
```

Edita `.env` con las credenciales correspondientes a PostgreSQL.

Por ejemplo:

```env
DATABASE_URL=postgres://postgres:TU_PASSWORD@localhost:5432/transporte_db?sslmode=disable
```

Las migraciones se encuentran en:

```text
backend-go/
└── internal/
    └── migrations/
        ├── 000001_init.up.sql / .down.sql                    (esquema base)
        ├── 000002_complaint_attachments.up.sql / .down.sql   (imágenes de reclamos)
        └── 000003_sync_database_setup.up.sql / .down.sql     (valoración y línea en reclamos, recaudo)
```

Al ejecutar el backend:

```bash
go run ./cmd/server
```

las migraciones pendientes se ejecutan automáticamente antes de iniciar el servidor HTTP.

En el log aparece el evento `migrations_ready` con la versión de la que partió y a la
que llegó (`"from":1,"to":3,"changed":true`). Si la base ya está al día, `changed` es
`false` y no se ejecuta nada.

Si una migración falla, el backend **no arranca** (evento `migrations_failed`) para no
trabajar con un esquema a medias. Con `MIGRATIONS_ENABLED=false` se saltan las
migraciones (por ejemplo, si el esquema se administra por fuera).

`golang-migrate` utiliza la tabla `schema_migrations` para registrar la versión actual de la base de datos.

### Migraciones

Para agregar un cambio al esquema de la base de datos, **no se debe modificar una migración que ya fue ejecutada**.

Se debe crear una nueva migración:

```text
internal/migrations/
├── ...
├── 000003_sync_database_setup.down.sql
├── 000004_nombre_del_cambio.up.sql
└── 000004_nombre_del_cambio.down.sql
```

El archivo `.up.sql` contiene los cambios que se aplicarán:

```sql
ALTER TABLE routes
ADD COLUMN description_extra TEXT;
```

El archivo `.down.sql` contiene el rollback:

```sql
ALTER TABLE routes
DROP COLUMN description_extra;
```

Al volver a iniciar el backend, `golang-migrate` detectará automáticamente la nueva migración y la ejecutará.

### Importante para una base de datos existente

No hace falta borrarla. Si `transporte_db` ya tiene tablas pero no la tabla
`schema_migrations` (porque se creó con `database_setup.sql` o aplicando la 000001 a
mano), el backend lo detecta al iniciar:

1. La marca como si ya tuviera la migración 000001 (o la 000002, si ya existe la tabla
   `complaint_attachments`). En el log aparece el evento `migrations_baseline`.
2. Aplica solo lo que falta. La 000003 es idempotente: agrega `rating`, `lineName`,
   la categoría `FARES_PAYMENT` y la tabla `recaudo_transactions` solo si no existen.

Los datos existentes no se tocan. Un candado de PostgreSQL evita que dos réplicas del
backend migren la misma base al mismo tiempo.

> `database_setup.sql` deja de ser el mecanismo principal para inicializar o actualizar la base de datos. Las migraciones de `internal/migrations/` pasan a ser la fuente oficial del esquema.

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

### Logs estructurados

El backend Go usa `zerolog` y emite JSON por defecto hacia stdout. Cada request
incluye `event`, `request_id`, método, ruta, estado y latencia; el ID también se
devuelve en el header `X-Request-ID`.

Variables opcionales:

```bash
LOG_LEVEL=debug       # trace, debug, info, warn, error, fatal, panic
LOG_FORMAT=json       # json (por defecto) o console
JWT_EXPIRES_IN=7d     # duración del token: 15m, 2h o 7d
```

### 5. Ejecutar el frontend (en otra terminal)

```bash
npm run dev:frontend
# http://localhost:5173
```

### 6. Mapa en tiempo real (Socket.io, en otra terminal)

`backend-go` no tiene Socket.io: los buses en vivo del mapa los emite el backend Node.
Se levanta en `:3002` para no chocar con `backend-go`, y el proxy de Vite le envía `/socket.io`:

```bash
npm run dev:realtime
# Socket.IO en http://localhost:3002
```

O todo junto (Go + tiempo real + frontend): `npm run dev`.

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
| Imágenes de reclamos | POST | `/complaints/:id/attachments` | PASSENGER (dueño del reclamo) |
| Imágenes de reclamos | GET | `/complaints/:id/attachments` | Dueño, ADMIN |
| Imágenes de reclamos | GET | `/complaints/:id/attachments/:attachmentId/file` | Dueño, ADMIN |
| Imágenes de reclamos | DELETE | `/complaints/:id/attachments/:attachmentId` | Dueño, ADMIN |

### Autenticación

Todos los endpoints protegidos requieren el header:
```
Authorization: Bearer <token>
```

El token se obtiene desde `POST /auth/login` o `POST /auth/register`.

El access token dura 15 minutos (`JWT_ACCESS_EXPIRES_IN`). Con el refresh token se pide
un par nuevo en `POST /auth/refresh`; cada refresh token sirve **una sola vez**
(rotación) y `POST /auth/logout` deja en la lista negra el access token y, si viene
en el body, el refresh token (la app móvil siempre lo envía). La app móvil
renueva sola: antes de que venza el access token, ante un 401 y al volver a primer
plano, y solo cierra la sesión si el refresh token ya no sirve. Detalle y pruebas en
vivo contra backend-go real (`npm run test:live:backend`) en
[mobile/README.md](mobile/README.md#cómo-funciona-la-autenticación).

### Imágenes de reclamos

El pasajero puede adjuntar hasta **3 fotos** a cada reclamo (por ejemplo, desde la app
móvil). El backend Go las valida, quita los datos personales que traen y oculta las
zonas que el pasajero marque (rostros, patentes) **antes** de guardarlas.

**Permisos.** Sube solo el pasajero dueño del reclamo; ven, descargan y borran el dueño
y los administradores. A cualquier otro usuario se le responde `404 reclamo no
encontrado`, para no revelar que el reclamo existe. Todas las rutas requieren
`Authorization: Bearer <token>`.

**Subir** — `POST /complaints/:id/attachments`, formulario `multipart/form-data`:

| Campo | Obligatorio | Contenido |
|-------|-------------|-----------|
| `file` | Sí | La foto: JPEG o PNG, máximo 5 MB, una por solicitud |
| `maskRegions` | No | JSON con las zonas a ocultar, en coordenadas relativas de 0 a 1 sobre la foto tal como la ve el usuario: `[{"x":0.2,"y":0.3,"width":0.25,"height":0.1}]` (máximo 10 zonas) |

```bash
curl -X POST http://localhost:3001/api/v1/complaints/<id>/attachments \
  -H "Authorization: Bearer <token>" \
  -F "file=@foto.jpg" \
  -F 'maskRegions=[{"x":0.2,"y":0.3,"width":0.25,"height":0.1}]'
```

Responde `201` con los datos de la imagen (sin la ruta interna ni el nombre original
del archivo):

```json
{
  "id": "…", "complaintId": "…", "mimeType": "image/jpeg", "sizeBytes": 245000,
  "width": 1536, "height": 2048, "sha256": "…", "maskedRegions": 1,
  "uploadedBy": "…", "createdAt": "2026-10-25T15:00:00Z"
}
```

**Qué se hace con cada foto** (`backend-go/internal/attachment`):

1. Se lee con límite de tamaño y se detecta el tipo real por su contenido (no por la
   extensión): solo JPEG y PNG.
2. Se revisan las dimensiones en la cabecera (máx. 8000 px por lado y 24 megapíxeles)
   para frenar "bombas" de descompresión.
3. Se gira según la orientación EXIF del celular y se reduce a 2048 px en su lado mayor.
4. Se pixelan las zonas marcadas (bloques grandes: no se puede leer ni reconocer).
5. Se vuelve a codificar desde cero: **desaparecen los metadatos EXIF, la ubicación GPS,
   los comentarios y cualquier dato escondido** en el archivo.
6. Se guarda con un nombre interno aleatorio (`ATTACHMENTS_DIR`) y se registra en la
   tabla `complaint_attachments`. Si el registro falla, el archivo se borra.

**Listar** — `GET /complaints/:id/attachments` → `200` con la lista (o `[]`).
Con `?mask=true`, `uploadedBy` se enmascara.

**Descargar** — `GET /complaints/:id/attachments/:attachmentId/file` → la imagen, con
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
sandbox` y `Cache-Control: private, no-store` (no se guarda en cachés intermedias).

**Borrar** — `DELETE /complaints/:id/attachments/:attachmentId` → `204`.

**Errores** (siempre `{"error": "mensaje en español"}`, sin detalles internos):

| Código | Cuándo |
|--------|--------|
| 400 | Formulario mal armado, imagen vacía, dañada o demasiado grande en píxeles, zonas inválidas ("la zona 2 sale de la imagen") |
| 401 | Sin sesión |
| 403 | Puede ver las imágenes pero no hacer esa acción (ej. un administrador subiendo) |
| 404 | El reclamo o la imagen no existen, o el usuario no tiene acceso |
| 409 | La misma imagen ya está en el reclamo, o el reclamo ya tiene 3 imágenes |
| 413 | La foto supera los 5 MB |
| 415 | No es JPEG ni PNG |
| 429 | Demasiadas subidas seguidas desde la misma IP |
| 503 | Sin base de datos o sin almacenamiento de imágenes disponible |

**Configuración** (`backend-go/.env`):

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `ATTACHMENTS_DIR` | `./data/attachments` | Carpeta de las imágenes (excluida de Git). En el cluster, un volumen persistente |
| `RATE_LIMIT_UPLOAD_PER_MIN` | `10` | Subidas por minuto por IP |
| `RATE_LIMIT_UPLOAD_BURST` | `3` | Subidas seguidas permitidas por IP |

Si la carpeta no se puede usar, el backend arranca igual y las rutas de imágenes
responden `503` (se avisa en el log con el evento `attachments_storage_unavailable`).

La tabla `complaint_attachments` la crea la migración 000002 al iniciar el backend.

**Pruebas.** `go test ./...` corre las pruebas unitarias. La prueba de punta a punta
(`internal/router/attachments_e2e_test.go`) y las del repositorio usan PostgreSQL real
y solo corren con `TEST_DATABASE_URL` apuntando a una base de prueba ya migrada.
Las pruebas de migraciones (`internal/db/migrate_integration_test.go`) crean y borran sus
propias bases temporales: `TEST_DATABASE_URL` debe apuntar a un servidor de prueba con
permiso para crear bases (por ejemplo `.../postgres`).

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

## 📱 Cliente WebSocket preparado para React Native

La futura app móvil puede reutilizar el cliente agnóstico de plataforma
[mobileWebSocketClient.ts](frontend/src/infrastructure/socket/mobileWebSocketClient.ts).
No depende de `window`, Vite ni de una librería de conectividad: usa el
`WebSocket` global disponible en React Native y permite conectar `NetInfo`
cuando se cree la app.

```ts
import NetInfo from '@react-native-community/netinfo';
import { MobileWebSocketClient } from './mobileWebSocketClient';

const client = new MobileWebSocketClient({
  url: `${API_BASE_URL.replace(/^http/, 'ws')}/ws`,
});
const unsubscribeNetwork = NetInfo.addEventListener((state) => {
  client.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
});
const unsubscribeMessages = client.onMessage((message) => {
  if (message.type === 'bus:update') {
    // Actualizar el estado de las micros en la app.
  }
});

client.subscribe('route', '7A');
client.connect();
```

El cliente conserva las suscripciones durante una reconexión, usa backoff
exponencial hasta 30 segundos y expone los estados `offline`, `connecting`,
`connected` y `reconnecting`. Al desmontar la pantalla, se deben ejecutar
`unsubscribeNetwork()`, `unsubscribeMessages()` y `client.disconnect()`.

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

Los Dockerfiles de los microservicios y de `backend-go` requieren contexto de build en la raíz (dependen del módulo local `proto/`):

```bash
docker build -f kubernetes/services/clima_service/Dockerfile .
docker build -f kubernetes/services/micro_service/Dockerfile .
docker build -f backend-go/Dockerfile .
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
