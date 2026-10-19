# TransitHub — App móvil (React Native + Expo)

App para pasajeros. Por ahora incluye el **módulo de autenticación** (login,
registro, sesión persistente y cierre de sesión) y la **vista de Perfil**, contra `backend-go`.

- Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router
- Tokens JWT guardados **cifrados** con `expo-secure-store`

## Correr la app

```bash
cd mobile
npm install
cp .env.example .env      # ajustar EXPO_PUBLIC_API_URL (ver abajo)
npx expo start            # escanear el QR con Expo Go, o "a" / "i" para emulador
```

`EXPO_PUBLIC_API_URL` es la URL de la API de backend-go terminada en `/api/v1`:

| Dónde corre la app | URL |
|---|---|
| Teléfono con Expo Go (misma Wi-Fi) | `http://<IP-local-del-PC>:3001/api/v1` |
| Emulador Android | `http://10.0.2.2:3001/api/v1` |
| Simulador iOS | `http://localhost:3001/api/v1` |
| Cluster | `https://backend-tpenroz.dev.censei.cl/api/v1` |

Si cambias `.env`, reinicia con `npx expo start --clear`.

## Comandos

```bash
npm test             # tests (Jest + React Native Testing Library)
npm run typecheck    # TypeScript
npx expo-doctor      # compatibilidad de dependencias con el SDK
```

Para agregar dependencias usar siempre `npx expo install <paquete>` (elige la versión compatible con el SDK).

## Cómo funciona la autenticación

```
src/
├── app/                    Rutas (Expo Router)
│   ├── _layout.tsx         AuthProvider + Stack.Protected (qué rutas se ven con/sin sesión)
│   ├── login.tsx           → screens/LoginScreen
│   ├── register.tsx        → screens/RegisterScreen
│   └── (app)/              Solo con sesión; pestañas inferiores (_layout.tsx)
│       ├── index.tsx       → screens/HomeScreen   (pestaña Inicio)
│       └── profile.tsx     → screens/ProfileScreen (pestaña Perfil)
├── auth/
│   ├── AuthContext.tsx     Estado de sesión: restaurar al abrir, signIn, signUp, signOut
│   └── validation.ts       Mismas reglas que backend-go (email, contraseña ≥ 8)
├── api/
│   ├── client.ts           fetch + Bearer token + renovación automática ante 401
│   └── authApi.ts          login, register, restoreSession, logout
└── storage/
    └── tokenStorage.ts     accessToken y refreshToken en expo-secure-store
```

- **Almacenamiento:** `accessToken` y `refreshToken` se guardan con `expo-secure-store`
  (Keychain en iOS, cifrado con Android Keystore en Android), con
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: solo se leen con el teléfono desbloqueado y no
  pasan a respaldos ni a otro dispositivo. Nunca se usa AsyncStorage.
- **Al abrir la app** se recupera la sesión guardada (`GET /auth/me`). Sin conexión,
  se muestra el login con la opción de reintentar y los tokens se conservan.
- **Renovación:** el access token dura ~15 min. Ante un 401 el cliente llama a
  `POST /auth/refresh`, guarda el par nuevo (backend-go rota el refresh token) y
  reintenta. Las renovaciones simultáneas comparten una sola llamada.
- **Sesión expirada:** si la renovación falla, se borran los tokens y la app vuelve al login.
- **Cerrar sesión** (botón en la pestaña Perfil, con confirmación): `POST /auth/logout`
  envía el access token (header) y el refresh token (body) a la **lista negra** de
  backend-go, que los rechaza desde ese momento aunque no hayan vencido. Los tokens
  locales se borran siempre; si el servidor no pudo confirmarlo (ej. sin conexión),
  el login muestra un aviso, porque esos tokens siguen vigentes hasta que expiren.
  El backend solo acepta en el body un refresh token firmado por él y del mismo usuario.
- **Límite de intentos:** si backend-go responde 429 (rate limiting), el formulario
  muestra el mensaje y bloquea el botón con cuenta regresiva hasta el `Retry-After`.

## Ubicación

Base para verificar si el usuario está cerca de un paradero antes de emitir
alertas de proximidad (`expo-location`, solo **mientras la app está en uso**;
no se pide ubicación en segundo plano).

- `src/location/locationService.ts`: permiso (`granted`, `undetermined`, `denied`,
  `blocked`) y posición actual. Si el GPS no responde en 15 s usa una posición
  guardada de hace menos de 1 minuto; si no hay, informa el error.
- `src/hooks/useLocation.ts`: al abrir la app solo consulta el permiso; el diálogo
  del sistema aparece cuando el usuario toca **Activar ubicación**. Con el permiso
  concedido **sigue la posición** (`watchPositionAsync`, cada 20 m o 10 s) mientras la
  app está en primer plano; se pausa en segundo plano y se reanuda al volver. Así la
  verificación del paradero y las alertas se actualizan solas si el usuario se mueve.
- `src/components/LocationCard.tsx` (pantalla Inicio): estado, coordenadas y
  precisión; si el permiso quedó bloqueado, botón **Abrir ajustes**.

El texto del permiso se configura en `app.json` (plugin `expo-location`).

### Paradero más cercano y radio de verificación

- `src/api/stopsApi.ts`: pide a backend-go los paraderos oficiales a menos de
  1 km (`GET /integrations/micro/stops?lat=&long=&radius_m=&limit=`). Si no hay
  resultados el backend responde `{}`; se descartan paraderos sin id o sin coordenadas.
- `src/location/geo.ts`: distancia con la fórmula de **Haversine** y verificación
  final en la app (no se confía solo en el filtro del servidor). Resultados:
  - `inside`: a `EXPO_PUBLIC_STOP_RADIUS_M` metros o menos de un paradero (por defecto 100).
  - `outside`: hay paraderos cerca, pero ninguno dentro del radio.
  - `no-stops`: no hay paraderos oficiales en 1 km.
  - `low-accuracy`: la precisión del GPS es peor que `EXPO_PUBLIC_MAX_LOCATION_ACCURACY_M`
    (por defecto 100 m); no se confirma que esté en el paradero.
- `src/hooks/useNearestStop.ts`: vuelve a consultar al backend solo si el usuario se
  aleja más de 200 m del punto de la última consulta (o al tocar **Actualizar
  paraderos**); con cada posición nueva recalcula la distancia sin pedir datos.
  Si el backend falla no reintenta con cada posición: programa un reintento a los
  30 s y duplica la espera en cada fallo seguido (máximo 5 min). **Reintentar**
  consulta al instante.
- `src/components/NearbyStopCard.tsx` (pantalla Inicio): paradero más cercano,
  distancia y si está dentro del radio.

### Alertas de proximidad

Las alertas **solo se emiten si la verificación anterior da `inside`**. En
cualquier otro estado (`outside`, `no-stops`, `low-accuracy` o sin ubicación) la
app no consulta las micros y la tarjeta explica por qué las alertas están en pausa.

- `src/api/busesApi.ts`: posiciones de las micros activas (`GET /buses?status=ACTIVE`,
  campos `lastLatitude`, `lastLongitude`, `lastLocationAt`).
- `src/alerts/proximityAlerts.ts`: reglas puras. Una micro genera alerta si su último
  reporte tiene menos de 2 minutos y está a `EXPO_PUBLIC_ALERT_RADIUS_M` metros o menos
  del paradero (por defecto 500). Se avisa una vez por micro; si sale del radio y vuelve,
  avisa de nuevo.
- `src/hooks/useProximityAlerts.ts`: con el paradero confirmado consulta las micros cada
  15 s, solo con la app en primer plano. Si el usuario sale del radio o cambia de
  paradero, detiene la consulta y limpia las alertas. Nunca hay dos consultas a la
  vez para el mismo paradero: si la red está lenta, se espera la que está en curso.
- `src/components/ProximityAlertsCard.tsx` (pantalla Inicio): aviso con vibración
  ("La micro ABCD12 está a 350 m de Plaza de Armas."), micros que se acercan y
  botón **Buscar micros ahora**.

Son alertas dentro de la app (no notificaciones push con la app cerrada).

## Configuración del pasajero

Preferencias guardadas en el teléfono con AsyncStorage (no son datos sensibles,
por eso no van en SecureStore como los tokens). Son del dispositivo: se mantienen
al cerrar la app y al cerrar sesión.

| Preferencia            | Valores                         | Por defecto |
| ---------------------- | ------------------------------- | ----------- |
| `notificationsEnabled` | `true` / `false`                | `false`     |
| `vibrationEnabled`     | `true` / `false`                | `true`      |
| `theme`                | `system`, `light`, `dark`       | `system`    |
| `textSize`             | `normal`, `large`, `extraLarge` | `normal`    |

- `src/settings/settingsStorage.ts`: lee y guarda (`transithub.settings`). Valida
  campo por campo: un valor dañado o desconocido vuelve a su valor por defecto sin
  perder el resto.
- `src/settings/SettingsContext.tsx`: `useSettings()` entrega `settings`,
  `updateSettings(cambios)` y `resetSettings()`. Los cambios se aplican al instante
  y se guardan en orden; si el guardado falla, el cambio se mantiene hasta cerrar
  la app y se muestra un aviso (`saveError`).
- La pantalla de carga espera a leer las preferencias (además de la sesión), para
  que la app no se muestre un instante con el tema equivocado.

## Perfil

La pestaña **Perfil** muestra avatar con iniciales, nombre, tipo de cuenta, correo,
estado de la cuenta y fecha de registro. Los datos se piden a `GET /auth/me` al
entrar y al deslizar hacia abajo; si falla (ej. sin conexión), se conservan los
datos ya cargados y se muestra un aviso.

`expo-secure-store` no funciona en la versión web; la app está pensada para iOS y Android.
