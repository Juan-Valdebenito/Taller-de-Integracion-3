#!/usr/bin/env bash
# Despliega TransitHub en el cluster, repartido en tres cuentas:
#
#   foundation → student-jvaldebenito: NATS, micros, backend-go y transporte-db
#   app        → student-tpenroz:      frontend, bridge e Ingress principal
#   realtime   → student-iglausser:    clima, telemetría, realtime e Ingress
#
# Uso (desde la raíz del repo):
#   bash kubernetes/deploy.sh <foundation|micros|app|realtime> render
#   bash kubernetes/deploy.sh <foundation|micros|app|realtime> check
#   bash kubernetes/deploy.sh <foundation|micros|app|realtime> apply
#   bash kubernetes/deploy.sh <foundation|micros|app|realtime> status
#   bash kubernetes/deploy.sh <foundation|micros|app|realtime> delete
#   bash kubernetes/deploy.sh foundation build
#
# Orden recomendado: foundation primero; después micros, realtime y app.
# El inicio de sesión en el cluster NO lo hace este script ni guarda contraseñas.

set -euo pipefail

# El script no envía los manifiestos originales sin procesar: renderiza copias
# con nombres de host, namespaces, imagen y clase Ingress tomados de cluster.env.
# `check` permite revisar esos YAML antes de `apply`.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
K8S="$ROOT/kubernetes"
ENV_FILE="${CLUSTER_ENV_FILE:-$K8S/cluster.env}"

# ── Stack "foundation": student-jvaldebenito ──────────────────
FOUNDATION_FILES=(
  services/micro_service/micros-secret.yaml
  services/nats-jetstream.yml
  transporte-db-configmap.yaml
  transporte-db-secret.yaml
  services/transporte_db/transporte-db-init-scripts.yaml
  services/transporte_db/transporte-db-deployment.yaml
  services/redis_server/redis-auth-secret.yaml
  services/redis_server/redis-server-deployment.yml
  services/backend-go/clima-client-secret.yaml
  services/backend-go/backend-go-deployment.yaml
  services/backend-go/backend-go-service.yaml
  ingress/backend-go-ingress.yaml
)

# ── Stack "micros": student-tpenroz ───────────────────────────
MICROS_FILES=(
  services/micro_service/micros-configmap.yaml
  services/micro_db/micros-db-init-scripts.yaml
  services/micro_db/micros-db.yml
  services/micro_service/micros-deployment.yaml
)

# ── Stack "app": student-tpenroz ──────────────────────────────
APP_FILES=(
  services/frontend/frontend-deployment.yaml
  ingress/frontend-ingress.yaml
)

# ── Stack "realtime": student-iglausser ──────────────────────
REALTIME_FILES=(
  services/clima_service/clima-configmap.yaml
#  services/clima_service/clima-resource-limits.yaml
  services/clima_db/clima-db-init-scripts.yaml
  services/clima_db/clima-db.yml
  services/clima_service/clima-deployment.yaml
  services/clima_service/clima-hpa.yaml
  transporte-db-configmap.yaml
  transporte-db-secret.yaml
  services/micro_telemetry/micro-telemetry-configmap.yaml
  services/micro_telemetry/micro-telemetry-secrets.yaml
  services/micro_telemetry/micro-telemetry-db-init-scripts.yaml
  services/micro_telemetry/micro-telemetry-db.yml
  services/micro_telemetry/micro-telemetry-deployment.yaml
  services/micro_telemetry/micro-telemetry-hpa.yaml
  services/clima_simulator/clima-simulator-deployment.yaml
  services/realtime/realtime-deployment.yaml
  ingress/realtime-ingress.yaml
)

# No se aplican en ningún stack:
#   ingress/ingress-nginx-controller-configmap.yaml  (configuración global, requiere admin del cluster)
#   services/micro_db/micros-db-storage.yml          (PVC de prueba de Tomás, nadie lo usa)

# ── Utilidades ────────────────────────────────────────────────
if [ -t 1 ]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; RESET=''
fi
info() { echo "${BOLD}==>${RESET} $1"; }
ok()   { echo "  ${GREEN}✔${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
die()  { echo "  ${RED}✘${RESET} $1" >&2; exit 1; }

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

load_env() {
  [ -f "$ENV_FILE" ] || die "Falta $ENV_FILE. Créalo con: cp kubernetes/cluster.env.example kubernetes/cluster.env"
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  FOUNDATION_NAMESPACE="${FOUNDATION_NAMESPACE:-student-jvaldebenito}"
  APP_NAMESPACE="${APP_NAMESPACE:-student-tpenroz}"
  REALTIME_NAMESPACE="${REALTIME_NAMESPACE:-student-iglausser}"
  APP_HOST="${APP_HOST:-backend-tpenroz.dev.censei.cl}"
  API_HOST="${API_HOST:-api-backend-tpenroz.dev.censei.cl}"
  REALTIME_HOST="${REALTIME_HOST:-realtime-backend-tpenroz.dev.censei.cl}"
  BACKEND_GO_IP="${BACKEND_GO_IP:-<BACKEND_GO_IP>}"
  # El cluster usa la clase global ingress-nginx; no se crean clases por namespace.
  APP_INGRESS_CLASS="${APP_INGRESS_CLASS:-nginx}"
  REALTIME_INGRESS_CLASS="${REALTIME_INGRESS_CLASS:-nginx}"
  APP_SCHEME="${APP_SCHEME:-https}"
  CORS_ORIGINS="${CORS_ORIGINS:-$APP_SCHEME://$APP_HOST}"
  DOCKERHUB_USER="${DOCKERHUB_USER:-}"
  IMAGE_TAG="${IMAGE_TAG:-v1}"
  BACKEND_GO_IMAGE_TAG="${BACKEND_GO_IMAGE_TAG:-$IMAGE_TAG}"

  # export REDIS_PASSWORD="$(openssl rand -base64 32)" 
  # u otro método para generar un password seguro. Se puede dejar vacío si no se usa Redis.
  REDIS_PASSWORD="${REDIS_PASSWORD:-}"

  # Cada stack se aplica con su propio namespace/contexto. Esto refleja que la
  # aplicación está repartida entre cuentas distintas del cluster.
  case "$STACK" in
    foundation)
      NAMESPACE="$FOUNDATION_NAMESPACE"
      CONTEXT="${FOUNDATION_KUBE_CONTEXT:-}"
      FILES=("${FOUNDATION_FILES[@]}")
      ;;
    app)
      NAMESPACE="$APP_NAMESPACE"
      CONTEXT="${APP_KUBE_CONTEXT:-}"
      FILES=("${APP_FILES[@]}")
      ;;
    micros)
      NAMESPACE="$APP_NAMESPACE"
      CONTEXT="${APP_KUBE_CONTEXT:-}"
      FILES=("${MICROS_FILES[@]}")
      ;;
    realtime)
      NAMESPACE="$REALTIME_NAMESPACE"
      CONTEXT="${REALTIME_KUBE_CONTEXT:-}"
      FILES=("${REALTIME_FILES[@]}")
      ;;
  esac
  OUT="$K8S/.rendered/$STACK"

  KUBECTL=(kubectl)
  if [ -n "$CONTEXT" ]; then
    KUBECTL+=(--context "$CONTEXT")
  fi
}

# ── Comandos ──────────────────────────────────────────────────
cmd_render() {
  info "Stack ${BOLD}$STACK${RESET} → namespace ${BOLD}$NAMESPACE${RESET} (manifiestos en kubernetes/.rendered/$STACK/)"
  rm -rf "$OUT"
  mkdir -p "$OUT"

  local i=0 f src dst
  for f in "${FILES[@]}"; do
    src="$K8S/$f"
    if [ ! -f "$src" ]; then
      case "$f" in
        services/clima_service/clima-hpa.yaml|services/micro_telemetry/micro-telemetry-hpa.yaml)
          warn "Manifiesto HPA no encontrado, se omite: kubernetes/$f"
          continue
          ;;
        *) die "No existe kubernetes/$f" ;;
      esac
    fi
    i=$((i + 1))
    dst="$OUT/$(printf '%02d' "$i")-$(basename "$f")"

    # 1. Namespace del recurso → el de este stack
    # 2. Dominios públicos y namespaces explícitos.
    sed -E \
      -e "s#namespace: student-[a-z0-9-]+#namespace: $NAMESPACE#" \
      -e "s#https://<HOST>#$APP_SCHEME://$APP_HOST#g" \
      -e "s#<HOST>#$APP_HOST#g" \
      -e "s#<API_HOST>#$API_HOST#g" \
      -e "s#<APP_HOST>#$APP_HOST#g" \
      -e "s#<FOUNDATION_NAMESPACE>#$FOUNDATION_NAMESPACE#g" \
      -e "s#<APP_NAMESPACE>#$APP_NAMESPACE#g" \
      -e "s#<REALTIME_NAMESPACE>#$REALTIME_NAMESPACE#g" \
      -e "s#<REALTIME_HOST>#$REALTIME_HOST#g" \
      -e "s#<BACKEND_GO_IP>#$BACKEND_GO_IP#g" \
      -e "s#<APP_INGRESS_CLASS>#$APP_INGRESS_CLASS#g" \
      -e "s#<REALTIME_INGRESS_CLASS>#$REALTIME_INGRESS_CLASS#g" \
      -e "s#<REDIS_PASSWORD>#$REDIS_PASSWORD#g" \
      -e "s#CORS_ORIGIN: \"[^\"]*\"#CORS_ORIGIN: \"$CORS_ORIGINS\"#" \
      "$src" > "$dst"

    if [ -n "$DOCKERHUB_USER" ]; then
      sed -E -i.bak "s#image: <DOCKERHUB_USER>/backend-go:[^ ]*#image: $DOCKERHUB_USER/backend-go:$BACKEND_GO_IMAGE_TAG#" "$dst"
      rm -f "$dst.bak"
      sed -E -i.bak "s#image: <DOCKERHUB_USER>/([a-z-]+):[^ ]*#image: $DOCKERHUB_USER/\1:$IMAGE_TAG#" "$dst"
      rm -f "$dst.bak"
    fi
  done

  ok "$i archivos generados"
  if grep -rl "<HOST>\|<DOCKERHUB_USER>\|<REDIS_PASSWORD>" "$OUT" >/dev/null 2>&1; then
    warn "Quedan valores sin completar en los manifiestos renderizados:"
    grep -rl "<HOST>\|<DOCKERHUB_USER>\|<REDIS_PASSWORD>" "$OUT" | sed "s#^$OUT/#      #"
  else
    ok "Namespace, direcciones internas, dominio e imágenes completados"
  fi
}

cmd_check() {
  info "Verificando acceso a $NAMESPACE${CONTEXT:+ (contexto $CONTEXT)}"
  command -v kubectl >/dev/null 2>&1 || die "kubectl no está instalado (en Ubuntu: sudo snap install kubectl --classic)."
  ok "kubectl: $(kubectl version --client 2>/dev/null | head -n 1)"

  "${KUBECTL[@]}" get pods -n "$NAMESPACE" >/dev/null 2>&1 \
    || die "No hay sesión con permisos sobre '$NAMESPACE'. Inicia sesión con la cuenta del stack '$STACK' (ver kubernetes/DEPLOY.md)."
  ok "Sesión activa con acceso a $NAMESPACE (contexto: $("${KUBECTL[@]}" config current-context 2>/dev/null || echo '?'))"

  local r
  for r in deployments services configmaps secrets ingresses; do
    if [ "$("${KUBECTL[@]}" auth can-i create "$r" -n "$NAMESPACE" 2>/dev/null)" = "yes" ]; then
      ok "puede crear $r"
    else
      warn "NO puede crear $r en $NAMESPACE"
    fi
  done

  if [ "$STACK" = "foundation" ]; then
    if "${KUBECTL[@]}" get svc micros-service-svc nats-svc -n "$FOUNDATION_NAMESPACE" >/dev/null 2>&1; then
      ok "Servicios foundation visibles en $FOUNDATION_NAMESPACE"
    else
      warn "No se pudo listar nats-svc en $FOUNDATION_NAMESPACE"
    fi
    if "${KUBECTL[@]}" get svc micros-service-svc -n "$APP_NAMESPACE" >/dev/null 2>&1; then
      ok "Micros visible en $APP_NAMESPACE"
    else
      warn "No se pudo listar micros-service-svc en $APP_NAMESPACE"
    fi
  elif [ "$STACK" = "app" ]; then
    warn "backend-go vive en $FOUNDATION_NAMESPACE; se accede mediante bridge-to-backend usando DNS interno de Kubernetes"
  elif [ "$STACK" = "realtime" ]; then
    if "${KUBECTL[@]}" get svc clima-service-svc clima-db-svc -n "$REALTIME_NAMESPACE" >/dev/null 2>&1 &&
       "${KUBECTL[@]}" get svc nats-svc -n "$FOUNDATION_NAMESPACE" >/dev/null 2>&1; then
      ok "Clima y NATS visibles desde realtime"
    else
      warn "No se pudieron listar clima en $REALTIME_NAMESPACE y/o nats-svc en $FOUNDATION_NAMESPACE"
    fi
  fi

  echo "  Cuota del namespace:"
  "${KUBECTL[@]}" get resourcequota -n "$NAMESPACE" 2>/dev/null | sed 's#^#      #' || true
}

cmd_build() {
  case "$STACK" in
    foundation|realtime) ;;
    *) die "build aplica a foundation o realtime." ;;
  esac
  [ -n "$DOCKERHUB_USER" ] || die "Falta DOCKERHUB_USER en cluster.env."
  command -v docker >/dev/null 2>&1 || die "docker no está instalado."
  info "Construyendo imágenes en $DOCKERHUB_USER (tag general $IMAGE_TAG, backend-go $BACKEND_GO_IMAGE_TAG)"
  cd "$ROOT"
  docker build -f backend-go/Dockerfile -t "$DOCKERHUB_USER/backend-go:$BACKEND_GO_IMAGE_TAG" .
  docker build -t "$DOCKERHUB_USER/transithub-realtime:$IMAGE_TAG" backend/
  docker build -t "$DOCKERHUB_USER/transithub-frontend:$IMAGE_TAG" frontend/
  docker build -t "$DOCKERHUB_USER/clima-simulator:$IMAGE_TAG" kubernetes/services/clima_simulator/
  docker push "$DOCKERHUB_USER/backend-go:$BACKEND_GO_IMAGE_TAG"
  docker push "$DOCKERHUB_USER/transithub-realtime:$IMAGE_TAG"
  docker push "$DOCKERHUB_USER/transithub-frontend:$IMAGE_TAG"
  docker push "$DOCKERHUB_USER/clima-simulator:$IMAGE_TAG"
  ok "Imágenes publicadas"
}

cmd_apply() {
  if [ "$STACK" != "micros" ] && [ -z "$DOCKERHUB_USER" ]; then
    die "Falta DOCKERHUB_USER en cluster.env (necesario para las imágenes del stack $STACK)."
  fi
  if [ "$STACK" = "app" ] && [ "$BACKEND_GO_IP" = "<BACKEND_GO_IP>" ]; then
    die "Falta BACKEND_GO_IP en cluster.env para el bridge hacia backend-go."
  fi
  if [ "$STACK" = "foundation" ] && [ -z "$REDIS_PASSWORD" ]; then
    die "Falta REDIS_PASSWORD en cluster.env o en el entorno para sincronizar Redis y backend-go."
  fi
  cmd_render
  cmd_check
  info "Aplicando en $NAMESPACE"
  local f
  for f in "$OUT"/*.y*ml; do
    "${KUBECTL[@]}" apply -n "$NAMESPACE" -f "$f" | sed 's#^#      #'
  done

  info "Esperando que los deployments queden listos (hasta 3 min c/u)"
  local d failed=0
  for d in $("${KUBECTL[@]}" get deployments -n "$NAMESPACE" -o name); do
    if "${KUBECTL[@]}" rollout status "$d" -n "$NAMESPACE" --timeout=180s >/dev/null 2>&1; then
      ok "$d"
    else
      warn "$d no quedó listo: kubectl -n $NAMESPACE describe $d"
      failed=1
    fi
  done

  echo
  if [ "$failed" = "1" ]; then
    warn "Hay deployments con problemas; revisa con: bash kubernetes/deploy.sh $STACK status"
  elif [ "$STACK" = "app" ]; then
    ok "Listo. La app quedará en $APP_SCHEME://$APP_HOST cuando external-dns cree el registro DNS (puede tardar unos minutos)."
  elif [ "$STACK" = "realtime" ]; then
    ok "Clima, telemetría y realtime desplegados en $NAMESPACE; app publica el WebSocket vía el bridge."
  else
    ok "Microservicios listos en $NAMESPACE. Sigue con: bash kubernetes/deploy.sh app apply"
  fi
}

cmd_status() {
  info "Recursos en $NAMESPACE"
  "${KUBECTL[@]}" get pods,svc,ingress -n "$NAMESPACE" -o wide || true
  if [ "$STACK" = "app" ]; then
    echo
    info "Prueba del Ingress y WebSocket"
    NAMESPACE="$NAMESPACE" REALTIME_NAMESPACE="$REALTIME_NAMESPACE" bash "$K8S/ingress/check-websocket.sh" "$APP_SCHEME://$APP_HOST" || true
  fi
}

cmd_delete() {
  [ -d "$OUT" ] || cmd_render
  echo "Se borrarán de ${BOLD}$NAMESPACE${RESET} los recursos de kubernetes/.rendered/$STACK/ (incluye bases de datos y sus datos)."
  read -r -p "Escribe el namespace para confirmar: " answer
  [ "$answer" = "$NAMESPACE" ] || die "Cancelado."
  local f
  for f in $(ls -r "$OUT"/*.y*ml); do
    "${KUBECTL[@]}" delete -n "$NAMESPACE" -f "$f" --ignore-not-found | sed 's#^#      #'
  done
  ok "Recursos borrados"
}

# ── Entrada ───────────────────────────────────────────────────
STACK="${1:-}"
COMMAND="${2:-}"
case "$STACK" in
  foundation|micros|app|realtime) ;;
  *) usage ;;
esac
load_env

case "$COMMAND" in
  render) cmd_render ;;
  check)  cmd_check ;;
  build)  cmd_build ;;
  apply)  cmd_apply ;;
  status) cmd_status ;;
  delete) cmd_delete ;;
  *) usage ;;
esac
