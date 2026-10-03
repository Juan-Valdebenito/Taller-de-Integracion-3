# Ingress con soporte WebSocket (wss://)

Resuelve la falla del mapa de buses en tiempo real: el navegador abre un
WebSocket contra el mismo host del frontend y el Ingress lo hace llegar al
servidor Socket.io (`realtime`) sin cortarlo.

```
Navegador ── https://<HOST>/            ──► frontend-svc   :80   (nginx + React)
          ── https://<HOST>/api/...     ──► backend-go-svc :3001 (API REST)
          ── wss://<HOST>/socket.io/... ──► realtime-svc   :3001 (Socket.io)
```

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `transithub-ingress.yaml` | Dos Ingress para el mismo host. El de `/socket.io` tiene timeouts de 1 h, sin buffering y con sesiones pegajosas (*sticky sessions*) por cookie, que Socket.io necesita cuando parte con *long-polling* |
| `ingress-nginx-controller-configmap.yaml` | **Opcional, requiere admin del cluster.** Los mismos valores como defecto global del controlador |
| `../services/realtime/realtime-deployment.yaml` | Servidor Socket.io (`backend/` en Node), 1 réplica |
| `../services/frontend/frontend-deployment.yaml` | Frontend estático en nginx |

## Antes de aplicar: placeholders a reemplazar

1. **`<HOST>`** en `transithub-ingress.yaml` (4 veces): el dominio que asigne el cluster.
2. **`CORS_ORIGIN`** en `kubernetes/transporte-db-configmap.yaml` → `https://<HOST>`.
   Los navegadores envían la cabecera `Origin` en los POST, aunque sean del mismo origen, y
   `backend-go` responde 403 si no coincide (ej.: crear reclamos o iniciar sesión).
3. **`<DOCKERHUB_USER>`** en los deployments de `realtime` y `frontend`.
4. **Certificado TLS** `transithub-tls` (sin él no hay `wss://`). Una de dos:
   - Con cert-manager: descomentar la anotación `cert-manager.io/cluster-issuer`.
   - Manual: `kubectl -n student-jvaldebenito create secret tls transithub-tls --cert=tls.crt --key=tls.key`

## Verificar el controlador del cluster

```bash
kubectl get ingressclass          # debe aparecer "nginx"
kubectl get pods -A | grep ingress
```
Si la clase tiene otro nombre, cambiar `ingressClassName`. Si el controlador **no** es
ingress-nginx (p. ej. Traefik), las anotaciones `nginx.ingress.kubernetes.io/*` no aplican:
Traefik soporta WebSocket sin configuración extra, pero las sesiones pegajosas
se configuran en el Service.

## Orden de despliegue

```bash
# Imágenes (desde la raíz del repo)
docker build -f backend-go/Dockerfile -t <usuario>/backend-go:v1 .
docker build -t <usuario>/transithub-realtime:v1 backend/
docker build -t <usuario>/transithub-frontend:v1 frontend/
docker push ...   # las tres

# Recursos
kubectl apply -f kubernetes/transporte-db-configmap.yaml
kubectl apply -f kubernetes/services/realtime/realtime-deployment.yaml
kubectl apply -f kubernetes/services/frontend/frontend-deployment.yaml
kubectl apply -f kubernetes/ingress/transithub-ingress.yaml
```

## Comprobar que el WebSocket funciona

```bash
# Debe responder 101 Switching Protocols
curl -i -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGVzdGtleTEyMzQ1Njc4OQ==" \
  "https://<HOST>/socket.io/?EIO=4&transport=websocket"
```
En el navegador: DevTools → Network → filtro **WS** → la conexión `socket.io` debe
quedar en estado `101` y mostrar mensajes `bus:location:broadcast`.

## Limitaciones conocidas

- `realtime` debe tener **1 réplica**: la simulación de buses está en memoria. Para
  escalar hace falta `@socket.io/redis-adapter`.
- En desarrollo local, el proxy de Vite manda `/socket.io` a `localhost:3001`, donde
  normalmente corre `backend-go` (que no tiene Socket.io). Para probar el mapa en local,
  levanten `npm run dev:backend:ts` en ese puerto.
