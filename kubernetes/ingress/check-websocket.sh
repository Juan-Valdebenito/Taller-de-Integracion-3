#!/usr/bin/env bash
# Comprueba que el Ingress enruta bien TransitHub y deja pasar Socket.io por
# WebSocket (wss://). No modifica nada en el cluster: solo hace peticiones HTTP.
#
# Uso:
#   ./kubernetes/ingress/check-websocket.sh <HOST|URL> [-k]
#
# Ejemplos:
#   ./kubernetes/ingress/check-websocket.sh transithub.midominio.cl
#   ./kubernetes/ingress/check-websocket.sh https://transithub.midominio.cl -k   # certificado autofirmado
#   ./kubernetes/ingress/check-websocket.sh http://localhost:5173                 # local, vía proxy de Vite
#
# Código de salida: 0 si todo pasa, 1 si falla alguna comprobación, 2 si el uso es incorrecto.

set -u

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

BASE="$1"
case "$BASE" in
  http://*|https://*) ;;
  *) BASE="https://$BASE" ;;
esac
BASE="${BASE%/}"

CURL=(curl -sS --max-time 10)
if [ "${2:-}" = "-k" ]; then
  CURL+=(-k)
fi

if [ -t 1 ]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; RESET=''
fi

FAILURES=0
ok()   { echo "  ${GREEN}✔${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
fail() { echo "  ${RED}✘${RESET} $1"; FAILURES=$((FAILURES + 1)); }

echo "${BOLD}Comprobando ${BASE}${RESET}"
echo

# ── 1. Frontend (/ → frontend-svc) ────────────────────────────
echo "${BOLD}1. Frontend${RESET}"
FRONT_CODE=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null)
[ "$FRONT_CODE" = "000" ] && FRONT_CODE=""
if [ "$FRONT_CODE" = "200" ]; then
  ok "GET / → 200"
else
  fail "GET / → ${FRONT_CODE:-sin respuesta} (esperado 200). Revisar frontend-svc y el pod 'frontend'."
fi

# ── 2. API (/api → backend-go-svc) ────────────────────────────
# /auth/me exige token: un 401 confirma que la petición llegó a backend-go.
echo "${BOLD}2. API REST${RESET}"
API_CODE=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/me" 2>/dev/null)
[ "$API_CODE" = "000" ] && API_CODE=""
case "$API_CODE" in
  401) ok "GET /api/v1/auth/me → 401 (llega a backend-go; pide token, como corresponde)" ;;
  403) fail "GET /api/v1/auth/me → 403. Si viene de backend-go, revisar CORS_ORIGIN en transporte-db-configmap." ;;
  404) fail "GET /api/v1/auth/me → 404. La ruta /api no está llegando a backend-go-svc." ;;
  *)   fail "GET /api/v1/auth/me → ${API_CODE:-sin respuesta} (esperado 401). Revisar backend-go-svc y el pod 'backend-go'." ;;
esac

# ── 3. Socket.io por polling HTTP (/socket.io → realtime-svc) ─
# Handshake de Engine.IO v4: la respuesta empieza con "0{" y trae un "sid".
echo "${BOLD}3. Socket.io (polling HTTP)${RESET}"
POLL_HEADERS=$(mktemp)
POLL_BODY=$("${CURL[@]}" -D "$POLL_HEADERS" "$BASE/socket.io/?EIO=4&transport=polling" 2>/dev/null)
POLL_CODE=$(head -n 1 "$POLL_HEADERS" | awk '{print $2}')
POLLING_OK=0
if [ "$POLL_CODE" = "200" ] && [[ "$POLL_BODY" == 0\{*\"sid\"* ]]; then
  POLLING_OK=1
  ok "Handshake polling → 200 con sid"
  if grep -qi '^set-cookie: *transithub-rt=' "$POLL_HEADERS"; then
    ok "Cookie de afinidad 'transithub-rt' presente (sesiones pegajosas activas)"
  else
    warn "Sin cookie de afinidad 'transithub-rt' (normal en local; en el cluster revisar la anotación 'affinity')"
  fi
else
  fail "Handshake polling → ${POLL_CODE:-sin respuesta} (esperado 200 con sid). El servidor 'realtime' no responde en /socket.io."
fi
rm -f "$POLL_HEADERS"

# ── 4. Upgrade a WebSocket ────────────────────────────────────
# Debe responder "101 Switching Protocols". Tras el 101 la conexión queda
# abierta, por eso se corta a los 5 s y solo se leen las cabeceras.
echo "${BOLD}4. Socket.io (WebSocket / wss)${RESET}"
WS_HEADERS=$(mktemp)
"${CURL[@]}" --http1.1 -N --max-time 5 -o /dev/null -D "$WS_HEADERS" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "$BASE/socket.io/?EIO=4&transport=websocket" 2>/dev/null
WS_CODE=$(head -n 1 "$WS_HEADERS" | awk '{print $2}')
WEBSOCKET_OK=0
if [ "$WS_CODE" = "101" ]; then
  WEBSOCKET_OK=1
  ok "Upgrade → 101 Switching Protocols"
else
  fail "Upgrade → ${WS_CODE:-sin respuesta} (esperado 101)."
fi
rm -f "$WS_HEADERS"

# ── Resumen ───────────────────────────────────────────────────
echo
if [ "$WEBSOCKET_OK" = "1" ]; then
  echo "${GREEN}${BOLD}Mapa: 🟢 En vivo por WebSocket${RESET}"
elif [ "$POLLING_OK" = "1" ]; then
  echo "${YELLOW}${BOLD}Mapa: 🟠 En vivo (respaldo HTTP)${RESET}"
  echo "  El Ingress no deja pasar el Upgrade. Revisar en transithub-ingress.yaml:"
  echo "  - que el controlador sea ingress-nginx (kubectl get ingressclass)"
  echo "  - las anotaciones proxy-http-version y proxy-read-timeout del Ingress de /socket.io"
else
  echo "${RED}${BOLD}Mapa: 🔴 Sin tiempo real${RESET}"
  echo "  kubectl -n student-jvaldebenito get pods -l app=realtime"
  echo "  kubectl -n student-jvaldebenito get endpoints realtime-svc"
  echo "  kubectl -n student-jvaldebenito describe ingress transithub-realtime-ingress"
fi

if [ "$FAILURES" -gt 0 ]; then
  echo
  echo "${RED}${FAILURES} comprobación(es) fallida(s).${RESET}"
  exit 1
fi

echo
echo "${GREEN}Todas las comprobaciones pasaron.${RESET}"
exit 0
