# Despliegue en el cluster

TransitHub se reparte en **tres cuentas del cluster** (cada una tiene su propia
cuota de recursos). `deploy.sh` toma los manifiestos del repo, les pone el
namespace, las direcciones internas, el dominio y las imágenes de cada cuenta,
y los aplica en orden.

| Stack | Cuenta / namespace | Responsables | Qué despliega |
|---|---|---|---|
| `foundation` | `student-jvaldebenito` | Ignacio | NATS · Redis · backend-go · transporte-db |
| `micros` | `student-tpenroz` | Tomás | BD (PostGIS con almacenamiento temporal) y servicio de micros |
| `app` | `student-tpenroz` | Tomás + Juan | frontend · bridge e Ingress del backend |
| `realtime` | `student-iglausser` | Ignacio | clima (BD, servicio, simulador) · telemetría · realtime · Ingress realtime |

```
                         Internet
                            │  https / wss
                    proxy.inf.uct.cl
                            │
┌──────────────── student-tpenroz (app) ────────────────┐
│ Ingress backend-go ──► bridge-to-backend (ExternalName)│
│ micros-service · micros-db · frontend-ingress          │
│ frontend-svc · API ingress · WebSocket → bridge         │
└──────────────────────────┬────────────────────────────┘
                           │ DNS interno de Kubernetes
┌──────────────────────────▼ student-jvaldebenito ──────┐
│ backend-go · transporte-db · NATS · Redis              │
└──────────────────────────┬────────────────────────────┘
                           │ DNS interno de Kubernetes
┌──────────────────────────▼ student-iglausser ─────────┐
│ clima-service · clima-db · simulador                   │
│ telemetría · realtime · realtime-ingress                │
└───────────────────────────────────────────────────────┘
```

> 🔐 Los secretos se configuran en `kubernetes/cluster.env`, que está ignorado
> por git, o mediante variables de entorno. No subas ese archivo al repositorio.

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
nano kubernetes/cluster.env      # completar namespaces, DOCKERHUB_USER y secretos
```

Si en la misma máquina están configuradas las cuentas (contextos de kubectl),
poner sus nombres en `FOUNDATION_KUBE_CONTEXT`, `APP_KUBE_CONTEXT` y
`REALTIME_KUBE_CONTEXT` (`kubectl config get-contexts`). El stack `micros` usa
`APP_KUBE_CONTEXT`.
Si cada persona usa su propia máquina, dejar los contextos vacíos.

## Secuencia de arranque

### 1. Stack `foundation` — con la sesión de la cuenta **jvaldebenito**

```bash
bash kubernetes/deploy.sh foundation check
bash kubernetes/deploy.sh foundation apply
bash kubernetes/deploy.sh foundation status
```

`foundation apply` requiere `REDIS_PASSWORD` y `CLIMATE_API_KEY` en `cluster.env`
o en el entorno. `CLIMATE_API_KEY` debe coincidir con la clave configurada para
el servicio de clima. Antes de aplicar, publica las imágenes propias:

```bash
bash kubernetes/deploy.sh foundation build
```

### 2. Stack `micros` — con la sesión de la cuenta **tpenroz**

```bash
bash kubernetes/deploy.sh micros check   # verifica acceso y permisos
bash kubernetes/deploy.sh micros apply
bash kubernetes/deploy.sh micros status
```

Este stack despliega la BD (PostGIS, Service y scripts de inicialización) y el
servicio en `APP_NAMESPACE`. La BD usa `emptyDir`: no requiere PVC, pero sus datos
se pierden cuando Kubernetes recrea el pod. La definición de PVC queda comentada
en `services/micro_db/micros-db.yml` para reactivarla cuando haya cuota disponible.
La BD nueva se inicializa con los seeds y **no copia los datos** del PVC anterior.
Si necesitas conservarlos, migra la BD con `pg_dump`/`pg_restore` antes de retirar
los recursos antiguos.
Como ya se creó un PVC `Pending` durante el intento anterior, `apply` no lo elimina
automáticamente al cambiar a `emptyDir`. Cuando el Deployment ya use `emptyDir`,
puedes retirar ese reclamo sin volumen asignado con:

```bash
kubectl -n student-tpenroz delete pvc micros-db-pvc
```

Después de comprobar la nueva BD y el servicio, se pueden retirar el servicio y
la configuración antiguos de foundation con:

```bash
kubectl -n student-jvaldebenito delete deployment micros-service service micros-service-svc configmap micros-configmap
```

Deja `micros-secrets` en foundation: `backend-go` lo usa para su `MICRO_API_KEY`.
No borres la BD antigua hasta confirmar la migración de datos. Para liberar el
espacio del namespace antiguo, elimina allí `micros-db`, `micros-db-svc`,
`micros-db-pvc` y `micros-db-init-scripts` después de respaldar lo necesario;
borrar el PVC elimina permanentemente su contenido.

### 3. Stack `realtime` — con la sesión de la cuenta **iglausser**

```bash
bash kubernetes/deploy.sh realtime check
bash kubernetes/deploy.sh realtime apply
bash kubernetes/deploy.sh realtime status
```

Este stack contiene clima, sus recursos PostGIS, simulador, telemetría y realtime.
La nueva BD de clima usa un PVC propio y no copia los datos del PVC que quedó en
foundation; migra los datos antes de eliminar el PVC anterior. `apply` no borra
los recursos que ya existan en `foundation`; retira el servicio antiguo solo
después de validar el nuevo y conservar/migrar los datos necesarios.
El Ingress de app enruta `/socket.io` al Service de realtime mediante
`bridge-to-realtime`; `REALTIME_HOST` también publica un Ingress directo para
realtime. Los HPA se agregan si sus manifiestos opcionales existen en el checkout.

### 4. Stack `app` — con la sesión de la cuenta **tpenroz**

```bash
bash kubernetes/deploy.sh app check      # sesión, permisos, cuota y si ve los microservicios
bash kubernetes/deploy.sh app apply      # frontend, bridge e Ingress
bash kubernetes/deploy.sh app status     # estado + prueba del Ingress y del WebSocket
```

El orden dentro de `app` sigue la secuencia del equipo:
`backend-go` permanece en `foundation`; el bridge de `app` lo conecta mediante el
DNS interno. El Ingress de API usa `API_HOST` y el frontend usa `APP_HOST`.

La app queda en `https://backend-tpenroz.dev.censei.cl` cuando external-dns crea el
registro DNS (puede tardar unos minutos).

## Comandos

| Comando | Qué hace | Toca el cluster |
|---|---|---|
| `render` | Genera los manifiestos finales en `kubernetes/.rendered/<stack>/` para revisarlos | No |
| `check` | Verifica kubectl, la sesión, los permisos y la cuota del namespace | Solo lectura |
| `build` | (solo `foundation` o `realtime`) `docker build` + `push` de imágenes propias | No (Docker Hub) |
| `apply` | `render` + `check` + `kubectl apply` en orden + espera a que los pods queden listos | Sí |
| `status` | Pods, Services e Ingress; en `app`, además, `ingress/check-websocket.sh` | Solo lectura |
| `delete` | Borra lo aplicado por el stack (pide escribir el namespace para confirmar) | Sí |

## Qué cambia `deploy.sh` en los manifiestos

| En el repo | Queda como |
|---|---|
| `namespace: student-*` | El namespace del stack (`FOUNDATION_NAMESPACE`, `APP_NAMESPACE` o `REALTIME_NAMESPACE`) |
| `<svc>.student-*.svc.cluster.local` | backend-go, NATS y Redis → `FOUNDATION_NAMESPACE`; Micros y su BD → `APP_NAMESPACE`; clima, su BD y telemetría → `REALTIME_NAMESPACE` |
| `backend-jvaldebenito.dev.censei.cl` / `<HOST>` | `APP_HOST` |
| `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN` | `APP_SCHEME://APP_HOST` |
| `<DOCKERHUB_USER>/…:v1` | `DOCKERHUB_USER/…:IMAGE_TAG` |

La telemetría y el servicio de clima quedan en `REALTIME_NAMESPACE`; clima se
conecta a NATS en `FOUNDATION_NAMESPACE`. La aplicación publica el WebSocket desde
`APP_HOST` a través de `bridge-to-realtime`.

**No se aplican:** `ingress/ingress-nginx-controller-configmap.yaml` (configuración global,
requiere admin del cluster) y `services/micro_db/micros-db-storage.yml` (PVC de prueba sin uso).

## Ingress con WebSocket

`ingress/backend-go-ingress.yaml` se despliega en `student-tpenroz` y envía el
tráfico al Service `bridge-to-backend`. El bridge resuelve `backend-go-svc` en
`student-jvaldebenito`, donde permanecen el Deployment y Service del backend.
El Ingress usa el formato del
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
| `/api/v1/integrations/...` responde error | `backend-go` no alcanza clima en `REALTIME_NAMESPACE` o Micros en `APP_NAMESPACE` (servicio caído o tráfico entre namespaces bloqueado) |
| Login o reclamos con 403 | `CORS_ORIGIN` no coincide con `APP_SCHEME://APP_HOST` |
| Mapa en 🟠 (respaldo HTTP) | El proxy de la universidad o el Ingress no deja pasar el `Upgrade` a WebSocket |
| Dominio no resuelve | external-dns aún no crea el registro: esperar unos minutos |
