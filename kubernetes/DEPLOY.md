# Despliegue en el cluster

TransitHub se reparte en **tres cuentas del cluster** (cada una tiene su propia
cuota de recursos). `deploy.sh` toma los manifiestos del repo, les pone el
namespace, las direcciones internas, el dominio y las imágenes de cada cuenta,
y los aplica en orden.

| Stack | Cuenta / namespace | Responsables | Qué despliega |
|---|---|---|---|
| `foundation` | `student-jvaldebenito` | Ignacio | NATS · clima · micros · `transporte_db` · `backend-go` |
| `app` | `student-tpenroz` | Tomás + Juan | `frontend` · bridge hacia backend-go · Ingress principal |
| `realtime` | `student-iglausser` | Ignacio | telemetría · `realtime` · Ingress realtime |

```
                         Internet
                            │  https / wss
                    proxy.inf.uct.cl
                            │
┌────────────── student-tpenroz (app) ────────────────┐
│ Ingress principal                                   │
│   /api → bridge → backend-go en foundation          │
│   /    → frontend-svc                               │
└──────────────────────┬─────────────────────────────┘
              │ gRPC + PostgreSQL
┌──────────────────────▼── student-jvaldebenito ──────┐
│ clima · micros · NATS · transporte-db · backend-go  │
└──────────────────────┬─────────────────────────────┘
              │ NATS + PostgreSQL
┌──────────────────────▼── student-iglausser ─────────┐
│ telemetría · realtime · Ingress realtime             │
└──────────────────────────────────────────────────────┘
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

Si en la misma máquina están configuradas **las tres cuentas** (tres contextos de
kubectl), poner sus nombres en `FOUNDATION_KUBE_CONTEXT`, `APP_KUBE_CONTEXT` y
`REALTIME_KUBE_CONTEXT`
(`kubectl config get-contexts`). Si cada persona usa su propia máquina, dejarlos vacíos.

## Secuencia de arranque

### 1. Stack `foundation` — con la sesión de **jvaldebenito**

```bash
bash kubernetes/deploy.sh foundation check
bash kubernetes/deploy.sh foundation apply
bash kubernetes/deploy.sh foundation status
```

Las imágenes de los microservicios ya están publicadas en `ignaciogsm/*`: no hay que construirlas.

### 2. Stack `app` — con la sesión de **tpenroz**

```bash
bash kubernetes/deploy.sh app check
bash kubernetes/deploy.sh app apply
bash kubernetes/deploy.sh app status
```

### 3. Stack `realtime` — con la sesión de **iglausser**

```bash
bash kubernetes/deploy.sh realtime check
bash kubernetes/deploy.sh realtime apply
bash kubernetes/deploy.sh realtime status
```

El orden dentro de `app` sigue la secuencia del equipo:

1. **Foundation** publica los Services de clima, micros, NATS y transporte-db.
2. **Backend-go** usa esos Services mediante DNS cross-namespace y se ejecuta en foundation.
3. **App** expone frontend y el bridge de backend-go mediante el Ingress principal.
4. **Realtime** replica sus ConfigMaps/Secrets de transporte porque los Secrets no se comparten entre
namespaces y usa `transporte-db-svc.student-jvaldebenito.svc.cluster.local`.
5. **PostgreSQL `transporte_db`** usa `emptyDir` porque el PV/PVC dio
   problemas: si el pod se reinicia, la BD se recrea vacía con los scripts de inicio.

La app queda en `https://backend-tpenroz.dev.censei.cl` cuando external-dns crea el
registro DNS (puede tardar unos minutos).

## Comandos

| Comando | Qué hace | Toca el cluster |
|---|---|---|
| `render` | Genera los manifiestos finales en `kubernetes/.rendered/<stack>/` para revisarlos | No |
| `check` | Verifica kubectl, la sesión, los permisos y la cuota del namespace | Solo lectura |
| `build` | `docker build` + `push` de las 3 imágenes propias | No (Docker Hub) |
| `apply` | `render` + `check` + `kubectl apply` en orden + espera a que los pods queden listos | Sí |
| `status` | Pods, Services e Ingress; en `app`, además, `ingress/check-websocket.sh` | Solo lectura |
| `delete` | Borra lo aplicado por el stack (pide escribir el namespace para confirmar) | Sí |

## Qué cambia `deploy.sh` en los manifiestos

| En el repo | Queda como |
|---|---|
| `namespace: student-*` | El namespace del stack |
| `<FOUNDATION_NAMESPACE>`, `<APP_NAMESPACE>`, `<REALTIME_NAMESPACE>` | Los namespaces configurados en `cluster.env` |
| `backend-jvaldebenito.dev.censei.cl` / `<HOST>` | `APP_HOST` |
| `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN` | `APP_SCHEME://APP_HOST` |
| `<DOCKERHUB_USER>/…:v1` | `DOCKERHUB_USER/…:IMAGE_TAG` |

La telemetría se aplica en `REALTIME_NAMESPACE` y consume NATS desde
`nats-svc.FOUNDATION_NAMESPACE.svc.cluster.local`.

## Autoscaling

`micro-telemetry` tiene un HPA activo con entre 1 y 3 réplicas y un objetivo de
70% de utilización promedio de CPU. El escalado hacia abajo se estabiliza durante
5 minutos para evitar oscilaciones. El HPA usa los `requests` del Deployment;
con el request actual de `50m`, el objetivo se alcanza alrededor de `35m` por
pod, por lo que conviene observar `kubectl top` antes de ajustar el valor.

El HPA requiere que el cluster tenga `metrics-server` funcionando. Verificarlo
antes de aplicar:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top pods -n student-iglausser
kubectl get hpa -n student-iglausser
```

`realtime` incluye un manifiesto HPA preparado, pero no se aplica desde
`deploy.sh` y permanece limitado a una réplica. Su simulación y sus broadcasts
viven en memoria; habilitar más de un pod sin estado compartido produciría
mapas divergentes y eventos duplicados. Antes de aumentar `maxReplicas` hay que
externalizar ese estado y configurar un adapter compartido para Socket.IO.

Cada réplica adicional de `micro-telemetry` aumenta las conexiones y
transacciones contra la base de telemetría y NATS. No subir el máximo de 3 sin
medir primero esa capacidad y confirmar la cuota del namespace.

Los Ingress del repo usan `ingressClassName: nginx`, que es la clase global del
controlador `ingress-nginx` del clúster. No se crean `IngressClass` ni
controladores a nivel de namespace; eso lo gestiona el administrador del cluster.

## Recursos que pide cada cuenta

| Stack | Recursos | RAM garantizada | CPU garantizada | Límite RAM / CPU |
|---|---|---|---|---|
| `micro` | 28 | ~1 GB | 0,5 | 2,8 GB / 2,25 |
| `app` | 15 | ~450 MB | 0,2 | 1,1 GB / 0,9 |

Si la cuota de `foundation` no alcanza, quitar `clima-simulator` de `FOUNDATION_FILES` en `deploy.sh`.

**No se aplican:** `ingress/ingress-nginx-controller-configmap.yaml` (configuración global,
requiere admin del cluster) y `services/micro_db/micros-db-storage.yml` (PVC de prueba sin uso).

## Ingress con WebSocket

`ingress/backend-go-ingress.yaml` (base: el Ingress de Tomás) usa el formato del
cluster de la UCT: `external-dns` → `proxy.inf.uct.cl`, clase `nginx`, sin `tls`
(el HTTPS lo termina el proxy). Como el cluster solo permite `path: /`, realtime
usa el host dedicado definido por `REALTIME_HOST` y apunta directamente al
`realtime-svc` local de `REALTIME_NAMESPACE`. El Ingress principal usa el
`backend-go-ingress-svc` de `backend-go-bridge.yaml`, cuyos Endpoints deben
contener la IP actual del pod backend-go.

Si el profesor no permite anotaciones `nginx.ingress.kubernetes.io/*`, quitarlas:
el mapa seguirá funcionando, pero la conexión en tiempo real se reconectará cada ~60 s.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| Pod en `CreateContainerConfigError` | Falta un Secret o ConfigMap en **ese** namespace |
| `backend-go` no queda *Ready* | `/readyz` no llega a PostgreSQL: revisar `transporte-db` |
| `/api/v1/integrations/...` responde error | `backend-go` no alcanza clima/micros en `FOUNDATION_NAMESPACE`, o el cluster bloquea tráfico entre namespaces |
| Login o reclamos con 403 | `CORS_ORIGIN` no coincide con `APP_SCHEME://APP_HOST` |
| Mapa en 🟠 (respaldo HTTP) | El proxy de la universidad o el Ingress no deja pasar el `Upgrade` a WebSocket |
| Dominio no resuelve | external-dns aún no crea el registro: esperar unos minutos |
