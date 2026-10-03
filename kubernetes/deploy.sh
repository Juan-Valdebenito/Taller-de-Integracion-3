#!/usr/bin/env bash
# Despliega TransitHub en el cluster con la cuenta configurada en kubernetes/cluster.env.
#
# Los manifiestos del repo tienen fijo el namespace student-jvaldebenito; este
# script genera una copia en kubernetes/.rendered/ con el namespace, dominio e
# imágenes de la cuenta elegida, y aplica UNA versión de cada recurso (en el repo
# hay duplicados: ver la lista FILES más abajo).
#
# Uso (desde la raíz del repo):
#   bash kubernetes/deploy.sh render   # solo genera kubernetes/.rendered/ (no toca el cluster)
#   bash kubernetes/deploy.sh check    # verifica kubectl, sesión y permisos en el namespace
#   bash kubernetes/deploy.sh build    # docker build + push de backend-go, realtime y frontend
#   bash kubernetes/deploy.sh apply    # render + kubectl apply en orden + espera los pods
#   bash kubernetes/deploy.sh status   # pods, servicios, ingress y prueba del WebSocket
#   bash kubernetes/deploy.sh delete   # borra del namespace lo que aplicó este script
#
# El inicio de sesión en el cluster NO lo hace este script ni guarda contraseñas:
# hay que estar conectado con la cuenta antes (ver kubernetes/DEPLOY.md).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
K8S="$ROOT/kubernetes"
OUT="$K8S/.rendered"
ENV_FILE="$K8S/cluster.env"

# Namespace y dominio con los que están escritos los manifiestos del repo
SOURCE_NAMESPACE="student-jvaldebenito"
SOURCE_HOST="backend-jvaldebenito.dev.censei.cl"

# Orden de despliegue: configuración → bases de datos → microservicios → app → ingress.
# Excluidos a propósito (duplicados o de prueba):
#   services/backend_go/backend-go-deployment.yaml   (duplica backend-go-deployment.yaml)
#   services/backend-go/backend-go-service.yaml      (backend-go-svc ya viene en backend-go-deployment.yaml)
#   services/transporte_db/transporte-db.yml         (duplica transporte-db-deployment.yaml)
#   ingress/backend-go-ingress.yaml                  (mismo host y ruta "/" que transithub-ingress.yaml)
#   ingress/ingress-nginx-controller-configmap.yaml  (requiere admin del cluster)
#   services/micro_db/micros-db-storage.yml          (PVC de prueba, nadie lo usa)
FILES=(
  # 1. Configuración y secretos
  transporte-db-configmap.yaml
  transporte-db-secret.yaml
  services/micro_service/micros-configmap.yaml
  services/micro_service/micros-secret.yaml
  services/clima_service/clima-configmap.yaml
  services/transporte_db/transporte-db-init-scripts.yaml
  services/micro_db/micros-db-init-scripts.yaml
  services/clima_db/clima-db-init-scripts.yaml
  # 2. Bases de datos y mensajería
  services/transporte_db/transporte-db-deployment.yaml
  services/micro_db/micros-db.yml
  services/clima_db/clima-db.yml
  services/nats-jetstream.yml
  # 3. Microservicios
  services/micro_service/micros-deployment.yaml
  services/clima_service/clima-deployment.yaml
  services/clima_simulator/clima-simulator-deployment.yaml
  # 4. Aplicación
  backend-go-deployment.yaml
  services/realtime/realtime-deployment.yaml
  services/frontend/frontend-deployment.yaml
  # 5. Entrada pública
  ingress/transithub-ingress.yaml
)

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

load_env() {
  [ -f "$ENV_FILE" ] || die "Falta $ENV_FILE. Créalo con: cp kubernetes/cluster.env.example kubernetes/cluster.env"
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  : "${CLUSTER_USER:?Falta CLUSTER_USER en cluster.env}"
  NAMESPACE="${NAMESPACE:-student-$CLUSTER_USER}"
  APP_HOST="${APP_HOST:-backend-$CLUSTER_USER.dev.censei.cl}"
  APP_SCHEME="${APP_SCHEME:-https}"
  DOCKERHUB_USER="${DOCKERHUB_USER:-}"
  IMAGE_TAG="${IMAGE_TAG:-v1}"
}

require_dockerhub_user() {
  [ -n "$DOCKERHUB_USER" ] || die "Falta DOCKERHUB_USER en cluster.env (las imágenes de backend-go, realtime y frontend se publican ahí)."
}

# ── Comandos ──────────────────────────────────────────────────
cmd_render() {
  load_env
  info "Generando manifiestos para ${BOLD}$NAMESPACE${RESET} ($APP_SCHEME://$APP_HOST) en kubernetes/.rendered/"
  rm -rf "$OUT"
  mkdir -p "$OUT"

  local i=0 f src dst
  for f in "${FILES[@]}"; do
    src="$K8S/$f"
    [ -f "$src" ] || die "No existe $f"
    i=$((i + 1))
    dst="$OUT/$(printf '%02d' "$i")-$(basename "$f")"

    sed \
      -e "s#https://<HOST>#$APP_SCHEME://$APP_HOST#g" \
      -e "s#<HOST>#$APP_HOST#g" \
      -e "s#$SOURCE_HOST#$APP_HOST#g" \
      -e "s#$SOURCE_NAMESPACE#$NAMESPACE#g" \
      -e "s#CORS_ORIGIN: \"[^\"]*\"#CORS_ORIGIN: \"$APP_SCHEME://$APP_HOST\"#" \
      "$src" > "$dst"

    if [ -n "$DOCKERHUB_USER" ]; then
      sed -i.bak \
        -e "s#image: ignaciogsm/backend-go:[^ ]*#image: $DOCKERHUB_USER/backend-go:$IMAGE_TAG#" \
        -e "s#image: <DOCKERHUB_USER>/\([a-z-]*\):[^ ]*#image: $DOCKERHUB_USER/\1:$IMAGE_TAG#" \
        "$dst"
      rm -f "$dst.bak"
    fi
  done

  ok "$i archivos generados"
  if grep -rl "<HOST>\|<DOCKERHUB_USER>\|$SOURCE_NAMESPACE" "$OUT" >/dev/null 2>&1; then
    warn "Quedan valores sin reemplazar en:"
    grep -rln "<HOST>\|<DOCKERHUB_USER>\|$SOURCE_NAMESPACE" "$OUT" | sed 's#^#      #'
    [ -n "$DOCKERHUB_USER" ] || warn "Completa DOCKERHUB_USER en cluster.env para las imágenes propias."
  else
    ok "Namespace, dominio e imágenes reemplazados"
  fi
}

cmd_check() {
  load_env
  info "Verificando acceso al cluster"
  command -v kubectl >/dev/null 2>&1 || die "kubectl no está instalado (en Ubuntu: sudo snap install kubectl --classic)."
  ok "kubectl: $(kubectl version --client 2>/dev/null | head -n 1)"

  kubectl get pods -n "$NAMESPACE" >/dev/null 2>&1 \
    || die "No hay sesión con permisos sobre '$NAMESPACE'. Inicia sesión con la cuenta $CLUSTER_USER (ver kubernetes/DEPLOY.md) y revisa NAMESPACE en cluster.env."
  ok "Sesión activa con acceso a $NAMESPACE (contexto: $(kubectl config current-context 2>/dev/null || echo '?'))"

  local r
  for r in deployments services configmaps secrets ingresses; do
    if [ "$(kubectl auth can-i create "$r" -n "$NAMESPACE" 2>/dev/null)" = "yes" ]; then
      ok "puede crear $r"
    else
      warn "NO puede crear $r en $NAMESPACE"
    fi
  done

  kubectl get resourcequota -n "$NAMESPACE" 2>/dev/null | sed 's#^#      #' || true
}

cmd_build() {
  load_env
  require_dockerhub_user
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
  load_env
  require_dockerhub_user
  cmd_render
  cmd_check
  info "Aplicando en $NAMESPACE"
  local f
  for f in "$OUT"/*.y*ml; do
    kubectl apply -n "$NAMESPACE" -f "$f" | sed 's#^#      #'
  done

  info "Esperando que los deployments queden listos (hasta 3 min c/u)"
  local d failed=0
  for d in $(kubectl get deployments -n "$NAMESPACE" -o name); do
    if kubectl rollout status "$d" -n "$NAMESPACE" --timeout=180s >/dev/null 2>&1; then
      ok "$d"
    else
      warn "$d no quedó listo: kubectl -n $NAMESPACE describe $d"
      failed=1
    fi
  done

  echo
  if [ "$failed" = "0" ]; then
    ok "Despliegue completo. La app quedará en $APP_SCHEME://$APP_HOST cuando external-dns cree el registro DNS (puede tardar unos minutos)."
  else
    warn "Hay deployments con problemas; revisa con: bash kubernetes/deploy.sh status"
  fi
}

cmd_status() {
  load_env
  info "Recursos en $NAMESPACE"
  kubectl get pods,svc,ingress -n "$NAMESPACE" -o wide || true
  echo
  info "Prueba del Ingress y WebSocket"
  NAMESPACE="$NAMESPACE" bash "$K8S/ingress/check-websocket.sh" "$APP_SCHEME://$APP_HOST" || true
}

cmd_delete() {
  load_env
  [ -d "$OUT" ] || cmd_render
  echo "Se borrarán de ${BOLD}$NAMESPACE${RESET} los recursos de kubernetes/.rendered/ (incluye las bases de datos y sus datos)."
  read -r -p "Escribe el namespace para confirmar: " answer
  [ "$answer" = "$NAMESPACE" ] || die "Cancelado."
  local files
  files=$(ls -r "$OUT"/*.y*ml)
  for f in $files; do
    kubectl delete -n "$NAMESPACE" -f "$f" --ignore-not-found | sed 's#^#      #'
  done
  ok "Recursos borrados"
}

case "${1:-}" in
  render) cmd_render ;;
  check)  cmd_check ;;
  build)  cmd_build ;;
  apply)  cmd_apply ;;
  status) cmd_status ;;
  delete) cmd_delete ;;
  *)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
