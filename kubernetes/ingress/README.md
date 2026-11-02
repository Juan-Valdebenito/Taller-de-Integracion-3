# Ingress con soporte WebSocket (wss://)

Publica el frontend, la API y el mapa de buses en tiempo real. El frontend y
Socket.io usan `APP_HOST`; la API usa `API_HOST`.

```
Navegador ── https://<APP_HOST>/            ──► frontend-svc       :80   (nginx + React)
          ── wss://<APP_HOST>/socket.io/... ──► bridge-to-realtime :3001 ──► realtime-svc
          ── https://<API_HOST>/...         ──► bridge-to-backend  :3001 ──► backend-go-svc
```

El Ingress y `bridge-to-backend` se despliegan en `student-tpenroz`. El backend y
su Service `backend-go-svc` permanecen en `student-jvaldebenito`; el bridge es un
Service `ExternalName` que resuelve el DNS completo del Service remoto.

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `frontend-ingress.yaml` | Sirve el frontend en `APP_HOST` y enruta `/socket.io` al bridge realtime. |
| `backend-go-ingress.yaml` | Publica la API en `API_HOST` a través de `bridge-to-backend`. |
| `backend-go-bridge.yaml` | ExternalName hacia el Service remoto de backend-go. |
| `../services/realtime/realtime-bridge.yml` | ExternalName hacia el Service realtime del namespace `REALTIME_NAMESPACE`. |
| `realtime-ingress.yaml` | Publica el Service realtime directamente en `REALTIME_HOST`. |
| `ingress-nginx-controller-configmap.yaml` | **Opcional, requiere admin del cluster.** Los mismos valores como defecto global del controlador |
| `../services/realtime/realtime-deployment.yaml` | Servidor Socket.io (`backend/` en Node), 1 réplica |
| `../services/frontend/frontend-deployment.yaml` | Frontend estático en nginx |

## Despliegue

`APP_HOST`, `API_HOST`, los namespaces, `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN` y las imágenes los completa
`kubernetes/deploy.sh` desde `kubernetes/cluster.env` (stack `app`, cuenta de Tomás).
El HTTPS lo termina el proxy de la universidad, así que no hace falta certificado propio.
Ver **[../DEPLOY.md](../DEPLOY.md)**.

## Verificar el controlador del cluster

```bash
kubectl get ingressclass          # debe aparecer "nginx"
kubectl get pods -A | grep ingress
```
Si la clase tiene otro nombre, cambiar `ingressClassName`. Si el controlador **no** es
ingress-nginx (p. ej. Traefik), las anotaciones `nginx.ingress.kubernetes.io/*` no aplican:
Traefik soporta WebSocket sin configuración extra, pero las sesiones pegajosas
se configuran en el Service.

## Comprobar que el WebSocket funciona

```bash
bash kubernetes/ingress/check-websocket.sh <HOST>          # agregar -k si el certificado es autofirmado
bash kubernetes/ingress/check-websocket.sh http://localhost:5173   # en local, vía proxy de Vite
```

El script solo hace peticiones HTTP (no cambia nada en el cluster) y comprueba en orden:

1. `/` responde 200 → el Ingress llega al **frontend**.
2. `/api/v1/auth/me` responde 401 → el Ingress llega a **backend-go** (pide token, como corresponde).
3. Handshake de Socket.io por *polling* con `sid`, y la cookie de afinidad `transithub-rt`.
4. Upgrade a WebSocket → **`101 Switching Protocols`**.

Al final indica qué estado verá el mapa (🟢/🟠/🔴) y qué revisar si algo falla.
Sale con código `0` si todo pasa y `1` si algo falla, así que también sirve en un pipeline de CI.
En el navegador: DevTools → Network → filtro **WS** → la conexión `socket.io` debe
quedar en estado `101` y mostrar mensajes `bus:location:broadcast`.

En el propio mapa, el indicador de arriba a la derecha muestra lo mismo:

| Indicador | Significado |
|---|---|
| 🟢 **En vivo** | WebSocket (`wss://`) funcionando |
| 🟠 **En vivo (respaldo HTTP)** | El Ingress no deja pasar el `Upgrade`: el mapa funciona por polling, revisar las anotaciones |
| 🔴 **Reconectando…** | Sin conexión con `realtime` (pod caído, Service mal configurado o sin ruta `/socket.io`) |

## Limitaciones conocidas

- `realtime` debe tener **1 réplica**: la simulación de buses está en memoria. Para
  escalar hace falta `@socket.io/redis-adapter`.
- En desarrollo local, `npm run dev:realtime` levanta este servidor en `:3002` y el
  proxy de Vite le envía `/socket.io` (la API sigue yendo a `backend-go` en `:3001`).
