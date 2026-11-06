# Ingress con soporte WebSocket (wss://)

Expone el servicio de buses en tiempo real mediante un host dedicado, porque
el cluster solo permite `path: /` en los Ingress. El Ingress de realtime vive en
el mismo namespace que `realtime-svc`: `student-iglausser`.

```
Navegador ── https://<APP_HOST>/          ──► frontend-svc     :80
          ── https://<APP_HOST>/api/...   ──► bridge → backend-go
          ── wss://<REALTIME_HOST>/      ──► realtime-svc     :3001
```

El Ingress y `bridge-to-backend` se despliegan en `student-tpenroz`. El backend y
su Service `backend-go-svc` permanecen en `student-jvaldebenito`; el bridge es un
Service `ExternalName` que resuelve el DNS completo del Service remoto.

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `backend-go-ingress.yaml` | Ingress principal para frontend y API, con `path: /` y `/api` |
| `backend-go-bridge.yaml` | Service + Endpoints en `student-tpenroz` que apuntan al pod backend-go de `student-jvaldebenito` |
| `realtime-ingress.yaml` | Ingress nginx en `student-iglausser`, con host `REALTIME_HOST`, path `/` y soporte WebSocket |
| `ingress-nginx-controller-configmap.yaml` | **Opcional, requiere admin del cluster.** Los mismos valores como defecto global del controlador |
| `../services/realtime/realtime-deployment.yaml` | Servidor Socket.io (`backend/` en Node), 1 réplica |
| `../services/frontend/frontend-deployment.yaml` | Frontend estático en nginx |

## Despliegue

`<HOST>`, los namespaces, `REALTIME_HOST`, `BACKEND_GO_IP`, `CORS_ORIGIN` y las
imágenes los completa `kubernetes/deploy.sh` desde `kubernetes/cluster.env`.
El HTTPS lo termina el proxy de la universidad, así que no hace falta certificado propio.
Ver **[../DEPLOY.md](../DEPLOY.md)**.

## Verificar el controlador del cluster

```bash
kubectl get ingressclass
kubectl get pods -A | grep ingress
```
En este cluster la clase disponible es la global `nginx` del controlador
`ingress-nginx`. Los manifests del repo quedan con `ingressClassName: nginx`; no
se crean clases por namespace ni se instalan controladores dentro de un
namespace. Si el cluster usa otro controlador distinto, el valor `ingressClassName`
se debe ajustar en coordinación con el administrador del clúster.

## Comprobar que el WebSocket funciona

```bash
bash kubernetes/ingress/check-websocket.sh <HOST>          # agregar -k si el certificado es autofirmado
bash kubernetes/ingress/check-websocket.sh http://localhost:5173   # en local, vía proxy de Vite
```

El script solo hace peticiones HTTP (no cambia nada en el cluster) y comprueba en orden:

1. `/` responde 200 → el Ingress llega al **frontend**.
2. `/api/v1/auth/me` responde 401 → el bridge llega a **backend-go**.
3. Handshake de Socket.io por *polling* con `sid`, y la cookie de afinidad `transithub-rt`.
4. Upgrade a WebSocket → **`101 Switching Protocols`** en `REALTIME_HOST`.

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
