# Despliegue en el cluster (cuenta de Tomás)

Todo está preparado para desplegar con **una cuenta distinta** a `jvaldebenito`
(cuya cuota de recursos se llenó). Los manifiestos del repo no se modifican:
`deploy.sh` genera una copia con el namespace, el dominio y las imágenes de la
cuenta elegida y aplica **una sola versión de cada recurso**.

> 🔐 **Las contraseñas no van en ningún archivo del repo.** El inicio de sesión en
> el cluster se hace a mano, antes de ejecutar el script. `cluster.env` solo
> tiene el nombre de usuario y está en `.gitignore`.

## Requisitos (Ubuntu)

```bash
sudo snap install kubectl --classic
sudo apt install -y docker.io git curl
sudo usermod -aG docker $USER   # cerrar sesión y volver a entrar
docker login                    # cuenta de Docker Hub donde se publican las imágenes
```

## Pasos

```bash
git clone https://github.com/Juan-Valdebenito/Taller-de-Integracion-3.git
cd Taller-de-Integracion-3
git checkout juan

# 1. Configuración (una vez)
cp kubernetes/cluster.env.example kubernetes/cluster.env
nano kubernetes/cluster.env     # revisar NAMESPACE y completar DOCKERHUB_USER

# 2. Iniciar sesión en el cluster con la cuenta tpenroz
#    (con el kubeconfig / método que entrega el curso; el script no lo hace)

# 3. Verificar acceso, permisos y cuota del namespace
bash kubernetes/deploy.sh check

# 4. Construir y publicar las imágenes propias (backend-go, realtime, frontend)
bash kubernetes/deploy.sh build

# 5. Desplegar todo en orden y esperar los pods
bash kubernetes/deploy.sh apply

# 6. Ver estado + probar Ingress y WebSocket
bash kubernetes/deploy.sh status
```

`bash kubernetes/deploy.sh render` genera los manifiestos en `kubernetes/.rendered/`
sin tocar el cluster, para revisarlos antes de aplicar.

## Qué cambia según `cluster.env`

| Variable | Valor para Tomás | Dónde se usa |
|---|---|---|
| `NAMESPACE` | `student-tpenroz` | `namespace:` de los 34 recursos y direcciones internas `*.svc.cluster.local` |
| `APP_HOST` | `backend-tpenroz.dev.censei.cl` | Host del Ingress, `CORS_ORIGIN` y `SOCKET_CORS_ORIGIN` |
| `DOCKERHUB_USER` | *(completar)* | Imágenes de `backend-go`, `transithub-realtime` y `transithub-frontend` |

Verificar el namespace real de la cuenta, una vez conectado:
`kubectl config view --minify -o jsonpath='{..namespace}'`

## Qué se despliega

Configuración → bases de datos (transporte, micros, clima) → NATS → microservicios
(micros, clima, simulador) → `backend-go` → `realtime` (Socket.io) → `frontend` → Ingress.

Pide en total **~1,2 GB de RAM y 0,6 CPU garantizados** (límites: 3,2 GB / 2,5 CPU).
Si la cuota no alcanza, se puede quitar `clima-simulator` de la lista `FILES` de `deploy.sh`.

**No se aplican** (duplicados o de prueba que llenaban el namespace):

| Archivo | Motivo |
|---|---|
| `services/backend_go/backend-go-deployment.yaml` | Duplica `backend-go-deployment.yaml` |
| `services/backend-go/backend-go-service.yaml` | `backend-go-svc` ya viene en `backend-go-deployment.yaml` |
| `services/transporte_db/transporte-db.yml` | Duplica `transporte-db-deployment.yaml` |
| `ingress/backend-go-ingress.yaml` | Mismo host y ruta `/` que `transithub-ingress.yaml` |
| `services/micro_db/micros-db-storage.yml` | PVC de prueba de 1 GiB que nadie usa |
| `ingress/ingress-nginx-controller-configmap.yaml` | Requiere admin del cluster |

## Ingress

`ingress/transithub-ingress.yaml` usa el mismo formato que el Ingress de Tomás
(`external-dns` → `proxy.inf.uct.cl`, clase `nginx`, sin `tls`), y agrega:

- `/socket.io` → `realtime-svc` con las anotaciones de WebSocket (timeout de 1 h, sesiones pegajosas).
- `/api` → `backend-go-svc` y `/` → `frontend-svc`.

Si el profesor no permite anotaciones `nginx.ingress.kubernetes.io/*`, quitarlas:
el mapa seguirá funcionando, pero la conexión en tiempo real se reconectará cada ~60 s.

## Borrar lo desplegado

```bash
bash kubernetes/deploy.sh delete   # pide escribir el namespace para confirmar
```
