# Despliegue en el cluster

TransitHub se reparte en **dos cuentas del cluster** (cada una tiene su propia
cuota de recursos). `deploy.sh` toma los manifiestos del repo, les pone el
namespace, las direcciones internas, el dominio y las imágenes de cada cuenta,
y los aplica en orden.

| Stack | Cuenta / namespace | Responsables | Qué despliega |
|---|---|---|---|
| `micro` | `student-jvaldebenito` | Ignacio | NATS · clima (BD, servicio, simulador) · micros (BD, servicio) · telemetría (BD, servicio) |
| `app` | `student-tpenroz` | Tomás + Juan | Secrets/ConfigMaps · BD `transporte_db` · `backend-go` · `realtime` (Socket.io) · `frontend` · Ingress |

```
                         Internet
                            │  https / wss
                    proxy.inf.uct.cl
                            │
┌──────────────── student-tpenroz (app) ────────────────┐
│ Ingress backend-go  (backend-tpenroz.dev.censei.cl)   │
│   /socket.io → realtime-svc    /api → backend-go-svc  │
│   /          → frontend-svc                           │
│ backend-go ──► transporte-db-svc (PostgreSQL)         │
└─────┼─────────────────────────────────────────────────┘
      │ gRPC (clima-service-svc:9090, micros-service-svc:9091)
┌─────▼────────── student-jvaldebenito (micro) ─────────┐
│ clima-service ─ clima-db     micros-service ─ micros-db│
│ clima-simulator   nats-svc   micro-telemetry ─ su BD  │
└───────────────────────────────────────────────────────┘
```

> 🔐 **Ninguna contraseña va en el repo.** El inicio de sesión en el cluster se
> hace a mano, antes de ejecutar el script. `kubernetes/cluster.env` solo tiene
> namespaces, dominio y usuario de Docker Hub, y está en `.gitignore`.

## Requisitos (Ubuntu)

```bash
sudo snap install kubectl --classic
sudo apt install -y docker.io git curl
sudo usermod -aG docker $USER   # cerrar sesión y volver a entrar
docker login                    # solo quien construya las imágenes del stack app
```

## Configuración (una vez)

```bash
git clone https://github.com/Juan-Valdebenito/Taller-de-Integracion-3.git
cd Taller-de-Integracion-3
git checkout juan
cp kubernetes/cluster.env.example kubernetes/cluster.env
nano kubernetes/cluster.env      # completar DOCKERHUB_USER y revisar namespaces
```

Si en la misma máquina están configuradas **las dos cuentas** (dos contextos de
kubectl), poner sus nombres en `MICRO_KUBE_CONTEXT` y `APP_KUBE_CONTEXT`
(`kubectl config get-contexts`). Si cada persona usa su propia máquina, dejarlos vacíos.

## Secuencia de arranque

### 1. Stack `micro` — con la sesión de la cuenta **jvaldebenito**

```bash
bash kubernetes/deploy.sh micro check    # sesión, permisos y cuota
bash kubernetes/deploy.sh micro apply    # configuración → BDs → NATS → microservicios
bash kubernetes/deploy.sh micro status
```

Las imágenes de los microservicios ya están publicadas en `ignaciogsm/*`: no hay que construirlas.

### 2. Stack `app` — con la sesión de la cuenta **tpenroz**

```bash
bash kubernetes/deploy.sh app check      # sesión, permisos, cuota y si ve los microservicios
bash kubernetes/deploy.sh app build      # construye y publica backend-go, realtime y frontend
bash kubernetes/deploy.sh app apply      # secretos → BD transporte → backend-go → realtime → frontend → Ingress
bash kubernetes/deploy.sh app status     # estado + prueba del Ingress y del WebSocket
```

El orden dentro de `app` sigue la secuencia del equipo:
1. **ConfigMaps y Secrets** (tarea de Ignacio). Los Secrets **no se comparten entre
   namespaces**, así que los que usa `backend-go` (BD, JWT y las API keys de clima y
   micros) se aplican también en esta cuenta.
2. **PostgreSQL `transporte_db`** (tarea de Tomás). Usa `emptyDir` porque el PV/PVC dio
   problemas: si el pod se reinicia, la BD se recrea vacía con los scripts de inicio.
3. **Deployment/Service de `backend-go` + Ingress con wss://** (tarea de Juan).

La app queda en `https://backend-tpenroz.dev.censei.cl` cuando external-dns crea el
registro DNS (puede tardar unos minutos).

## Comandos

| Comando | Qué hace | Toca el cluster |
|---|---|---|
| `render` | Genera los manifiestos finales en `kubernetes/.rendered/<stack>/` para revisarlos | No |
| `check` | Verifica kubectl, la sesión, los permisos y la cuota del namespace | Solo lectura |
| `build` | (solo `app`) `docker build` + `push` de las 3 imágenes propias | No (Docker Hub) |
| `apply` | `render` + `check` + `kubectl apply` en orden + espera a que los pods queden listos | Sí |
| `status` | Pods, Services e Ingress; en `app`, además, `ingress/check-websocket.sh` | Solo lectura |
| `delete` | Borra lo aplicado por el stack (pide escribir el namespace para confirmar) | Sí |

## Qué cambia `deploy.sh` en los manifiestos

| En el repo | Queda como |
|---|---|
| `namespace: student-*` | El namespace del stack (`MICRO_NAMESPACE` o `APP_NAMESPACE`) |
| `<svc>.student-*.svc.cluster.local` | `transporte-db`, `backend-go`, `realtime` y `frontend` → `APP_NAMESPACE`; el resto (clima, micros, NATS, telemetría) → `MICRO_NAMESPACE` |
| `backend-jvaldebenito.dev.censei.cl` / `<HOST>` | `APP_HOST` |
| `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN` | `APP_SCHEME://APP_HOST` |
| `<DOCKERHUB_USER>/…:v1` | `DOCKERHUB_USER/…:IMAGE_TAG` |

La telemetría de Ignacio está escrita para `student-iglausser`; con `deploy.sh` queda
en `MICRO_NAMESPACE` (la cuenta jvaldebenito), junto al NATS que usa.

## Recursos que pide cada cuenta

| Stack | Recursos | RAM garantizada | CPU garantizada | Límite RAM / CPU |
|---|---|---|---|---|
| `micro` | 28 | ~1 GB | 0,5 | 2,8 GB / 2,25 |
| `app` | 15 | ~450 MB | 0,2 | 1,1 GB / 0,9 |

Si la cuota de `micro` no alcanza, quitar `clima-simulator` de `MICRO_FILES` en `deploy.sh`.

**No se aplican:** `ingress/ingress-nginx-controller-configmap.yaml` (configuración global,
requiere admin del cluster) y `services/micro_db/micros-db-storage.yml` (PVC de prueba sin uso).

## Ingress con WebSocket

`ingress/backend-go-ingress.yaml` (base: el Ingress de Tomás) usa el formato del
cluster de la UCT: `external-dns` → `proxy.inf.uct.cl`, clase `nginx`, sin `tls`
(el HTTPS lo termina el proxy). Para el mapa en tiempo real agrega `proxy-http-version 1.1`,
timeouts de 1 h, sin buffering y sesiones pegajosas por cookie.

Si el profesor no permite anotaciones `nginx.ingress.kubernetes.io/*`, quitarlas:
el mapa seguirá funcionando, pero la conexión en tiempo real se reconectará cada ~60 s.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| Pod en `CreateContainerConfigError` | Falta un Secret o ConfigMap en **ese** namespace |
| `backend-go` no queda *Ready* | `/readyz` no llega a PostgreSQL: revisar `transporte-db` |
| `/api/v1/integrations/...` responde error | `backend-go` no alcanza clima/micros en la otra cuenta (stack `micro` caído, o el cluster bloquea tráfico entre namespaces) |
| Login o reclamos con 403 | `CORS_ORIGIN` no coincide con `APP_SCHEME://APP_HOST` |
| Mapa en 🟠 (respaldo HTTP) | El proxy de la universidad o el Ingress no deja pasar el `Upgrade` a WebSocket |
| Dominio no resuelve | external-dns aún no crea el registro: esperar unos minutos |
