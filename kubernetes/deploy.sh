#!/usr/bin/env bash
# Despliega TransitHub en el cluster, repartido en DOS cuentas (ver kubernetes/DEPLOY.md):
#
#   micro → cuenta de Ignacio (MICRO_NAMESPACE): NATS, clima, micros y telemetría
#   app   → cuenta de Tomás   (APP_NAMESPACE):   Secrets/ConfigMaps, BD transporte,
#                                                backend-go, realtime, frontend e Ingress
#
# Uso (desde la raíz del repo):
#   bash kubernetes/deploy.sh <micro|app> render   # genera kubernetes/.rendered/<stack>/ (no toca el cluster)
#   bash kubernetes/deploy.sh <micro|app> check    # verifica kubectl, sesión, permisos y cuota
#   bash kubernetes/deploy.sh app build            # docker build + push de backend-go, realtime y frontend
#   bash kubernetes/deploy.sh <micro|app> apply    # render + kubectl apply en orden + espera los pods
#   bash kubernetes/deploy.sh <micro|app> status   # pods, servicios e ingress (+ prueba WebSocket en app)
#   bash kubernetes/deploy.sh <micro|app> delete   # borra del namespace lo que aplicó este script
#
# Orden: primero "micro" (el backend llama por gRPC a clima y micros), después "app".
# El inicio de sesión en el cluster NO lo hace este script ni guarda contraseñas.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
K8S="$ROOT/kubernetes"
ENV_FILE="$K8S/cluster.env"

# Dominio con el que está escrito el Ingress en el repo
SOURCE_HOST="backend-jvaldebenito.dev.censei.cl"

# Services que viven en la cuenta "app"; cualquier otro <svc>.student-*.svc es de "micro".
APP_SERVICES="transporte-db-svc|backend-go-svc|realtime-svc|frontend-svc"

# ── Stack "micro": cuenta de Ignacio ──────────────────────────
# Orden: configuración → bases de datos → mensajería → microservicios.
MICRO_FILES=(
  services/clima_service/clima-configmap.yaml
  services/micro_service/micros-configmap.yaml
  services/micro_service/micros-secret.yaml
  services/micro_telemetry/micro-telemetry-configmap.yaml
  services/micro_telemetry/micro-telemetry-secrets.yaml
  services/clima_db/clima-db-init-scripts.yaml
  services/micro_db/micros-db-init-scripts.yaml
  services/micro_telemetry/micro-telemetry-db-init-scripts.yaml
  services/clima_db/clima-db.yml
  services/micro_db/micros-db.yml
  services/micro_telemetry/micro-telemetry-db.yml
  services/nats-jetstream.yml
  services/clima_service/clima-deployment.yaml
  services/micro_service/micros-deployment.yaml
  services/micro_telemetry/micro-telemetry-deployment.yaml
  services/clima_simulator/clima-simulator-deployment.yaml
)

# ── Stack "app": cuenta de Tomás + Juan ───────────────────────
# Secuencia de arranque del equipo:
#   1. ConfigMaps y Secrets (tarea de Ignacio). Los Secrets NO se comparten entre
#      namespaces: los que usa backend-go (incluidas las API keys de clima y
#      micros) tienen que existir también en esta cuenta.
#   2. Base de datos PostgreSQL transporte_db (tarea de Tomás; emptyDir por ahora).
#   3. Deployment/Service de backend-go + realtime + frontend e Ingress con wss:// (tarea de Juan).
APP_FILES=(
  transporte-db-configmap.yaml
  transporte-db-secret.yaml
  services/clima_service/clima-configmap.yaml
  services/micro_service/micros-secret.yaml
  services/transporte_db/transporte-db-init-scripts.yaml
  services/transporte_db/transporte-db-deployment.yaml
  services/backend-go/backend-go-deployment.yaml
  services/backend-go/backend-go-service.yaml
  services/realtime/realtime-deployment.yaml
  services/frontend/frontend-deployment.yaml
  ingress/backend-go-ingress.yaml
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
  MICRO_NAMESPACE="${MICRO_NAMESPACE:-student-jvaldebenito}"
  APP_NAMESPACE="${APP_NAMESPACE:-student-tpenroz}"
  APP_HOST="${APP_HOST:-backend-tpenroz.dev.censei.cl}"
  APP_SCHEME="${APP_SCHEME:-https}"
  DOCKERHUB_USER="${DOCKERHUB_USER:-}"
  IMAGE_TAG="${IMAGE_TAG:-v1}"

  case "$STACK" in
    micro)
      NAMESPACE="$MICRO_NAMESPACE"
      CONTEXT="${MICRO_KUBE_CONTEXT:-}"
      FILES=("${MICRO_FILES[@]}")
      ;;
    app)
      NAMESPACE="$APP_NAMESPACE"
      CONTEXT="${APP_KUBE_CONTEXT:-}"
      FILES=("${APP_FILES[@]}")
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
    [ -f "$src" ] || die "No existe kubernetes/$f"
    i=$((i + 1))
    dst="$OUT/$(printf '%02d' "$i")-$(basename "$f")"

    # 1. Namespace del recurso → el de este stack
    # 2. Direcciones internas <svc>.student-*.svc: primero todas a la cuenta "micro",
    #    después las de la cuenta "app" (transporte-db, backend-go, realtime, frontend)
    # 3. Dominio público, CORS e imágenes propias
    sed -E \
      -e "s#namespace: student-[a-z0-9-]+#namespace: $NAMESPACE#" \
      -e "s#([a-z0-9-]+-svc)\.student-[a-z0-9-]+\.svc#\1.$MICRO_NAMESPACE.svc#g" \
      -e "s#($APP_SERVICES)\.$MICRO_NAMESPACE\.svc#\1.$APP_NAMESPACE.svc#g" \
      -e "s#https://<HOST>#$APP_SCHEME://$APP_HOST#g" \
      -e "s#<HOST>#$APP_HOST#g" \
      -e "s#$SOURCE_HOST#$APP_HOST#g" \
      -e "s#CORS_ORIGIN: \"[^\"]*\"#CORS_ORIGIN: \"$APP_SCHEME://$APP_HOST\"#" \
      "$src" > "$dst"

    if [ -n "$DOCKERHUB_USER" ]; then
      sed -E -i.bak "s#image: <DOCKERHUB_USER>/([a-z-]+):[^ ]*#image: $DOCKERHUB_USER/\1:$IMAGE_TAG#" "$dst"
      rm -f "$dst.bak"
    fi
  done

  ok "$i archivos generados"
  if grep -rl "<HOST>\|<DOCKERHUB_USER>" "$OUT" >/dev/null 2>&1; then
    warn "Quedan valores sin completar (falta DOCKERHUB_USER en cluster.env) en:"
    grep -rl "<HOST>\|<DOCKERHUB_USER>" "$OUT" | sed "s#^$OUT/#      #"
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

  if [ "$STACK" = "app" ]; then
    # backend-go llama por gRPC a clima-service-svc y micros-service-svc en la otra cuenta
    if "${KUBECTL[@]}" get svc clima-service-svc micros-service-svc -n "$MICRO_NAMESPACE" >/dev/null 2>&1; then
      ok "Microservicios visibles en $MICRO_NAMESPACE"
    else
      warn "No se pudo listar clima/micros en $MICRO_NAMESPACE (normal si esta cuenta no tiene permisos de lectura allí;"
      warn "  igual deben estar desplegados antes con: bash kubernetes/deploy.sh micro apply)"
    fi
  fi

  echo "  Cuota del namespace:"
  "${KUBECTL[@]}" get resourcequota -n "$NAMESPACE" 2>/dev/null | sed 's#^#      #' || true
}

cmd_build() {
  [ "$STACK" = "app" ] || die "build solo aplica al stack app (los microservicios de Ignacio ya están publicados en ignaciogsm/*)."
  [ -n "$DOCKERHUB_USER" ] || die "Falta DOCKERHUB_USER en cluster.env."
  command -v docker >/dev/null 2>&1 || die "docker no está instalado."
  info "Construyendo y publicando imágenes en $DOCKERHUB_USER (tag $IMAGE_TAG)"
  cd "$ROOT"
  docker build -f backend-go/Dockerfile -t "$DOCKERHUB_USER/backend-go:$IMAGE_TAG" .
  docker build -t "$DOCKERHUB_USER/transithub-realtime:$IMAGE_TAG" backend/
  docker build -t "$DOCKERHUB_USER/transithub-frontend:$IMAGE_TAG" frontend/
  docker push "$DOCKERHUB_USER/backend-go:$IMAGE_TAG"
  docker push "$DOCKERHUB_USER/transithub-realtime:$IMAGE_TAG"
  docker push "$DOCKERHUB_USER/transithub-frontend:$IMAGE_TAG"
  ok "Imágenes publicadas"
}

cmd_apply() {
  if [ "$STACK" = "app" ] && [ -z "$DOCKERHUB_USER" ]; then
    die "Falta DOCKERHUB_USER en cluster.env (imágenes de backend-go, realtime y frontend)."
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
    NAMESPACE="$NAMESPACE" bash "$K8S/ingress/check-websocket.sh" "$APP_SCHEME://$APP_HOST" || true
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
  micro|app) ;;
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
