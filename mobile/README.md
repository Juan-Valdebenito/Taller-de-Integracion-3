# TransitHub — App móvil (React Native + Expo)

App de pasajeros, empresas y administradores, con las mismas secciones que el
frontend web. Además de autenticación, perfil, paraderos y alertas, las cuentas
`COMPANY` tienen panel de flota, consulta de rutas y modo conductor conectado a
`backend-go`.

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

## Secciones por rol

Como el web, cada rol tiene su propia sección y solo puede abrir la suya
(`Stack.Protected` en `app/_layout.tsx`). Al iniciar sesión, la app lleva a cada
usuario a la de su rol:

| Rol | Sección | Pestañas (como el menú del web) |
|---|---|---|
| `PASSENGER` | `/` (`app/(app)/`) | 🗺️ Mapa · 📋 Reclamos · 👤 Perfil · ⚙️ Configuración |
| `COMPANY` | `/company` (`app/company/`) | 📊 Dashboard · 🎛️ Conductor · 🚍 Micros · 🗺️ Rutas · 📋 Reclamos |
| `ADMIN` | `/admin` (`app/admin/`) | 📊 Dashboard · 🏢 Empresas · 🗺️ Rutas · 👥 Usuarios · 📋 Reclamos |

Las pestañas marcadas con 🚧 en la app todavía son provisionales.

## Vistas de empresa y conductor

En la sección de empresa, la flota y las rutas se leen desde
`GET /buses` y `GET /routes`; iniciar un recorrido asigna la ruta elegida y
cambia la micro a `ACTIVE`, y finalizarlo la cambia a `INACTIVE` mediante
`PATCH /buses/:id`. El backend actual no ofrece un recurso de viajes: el estado
activo se guarda en la micro, pero el cronómetro del recorrido permanece local.

## Ver la app en VS Code (vista previa web)

Sin teléfono ni emulador: la app corre como página web y se abre en el navegador
integrado de VS Code.

1. Backend Go corriendo en el PC (`npm run dev` desde la raíz). En `backend-go/.env`,
   `CORS_ORIGIN` debe incluir el origen de la vista previa:
   `CORS_ORIGIN=http://localhost:5173,http://localhost:8081`
2. En `mobile/.env`: `EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1`
3. `npx expo start --web --clear`
4. En VS Code: `Ctrl+Shift+P` → **Simple Browser: Show** → `http://localhost:8081`

Qué cambia en web (`src/utils/platform.ts`):

- La sesión se guarda en `sessionStorage` (el navegador no tiene almacenamiento
  cifrado) y se borra al cerrar la pestaña. Es solo para desarrollo.
- Las confirmaciones (cerrar sesión, restablecer) usan el diálogo del navegador.
- La ubicación usa el GPS del navegador (pide permiso). Si la bloquea, se habilita
  desde el ícono junto a la dirección de la página.
- Las notificaciones del teléfono no existen en web: el interruptor aparece
  desactivado y las alertas se ven en la pantalla del Mapa.
- El backend del cluster no acepta el origen `localhost:8081` (CORS), así que la
  vista previa web se usa con el backend local.

## Comandos

```bash
npm test                   # tests (Jest + React Native Testing Library)
npm run typecheck          # TypeScript
npx expo-doctor            # compatibilidad de dependencias con el SDK
npm run test:live:backend  # pruebas de sesión contra backend-go real (requiere LIVE_DATABASE_URL)
npm run test:live          # las mismas sin levantar backend (solo corre la de configuración)
```

Las pruebas en vivo están explicadas en
[Pruebas en vivo contra backend-go](#pruebas-en-vivo-contra-backend-go).

Para agregar dependencias usar siempre `npx expo install <paquete>` (elige la versión compatible con el SDK).

## Cómo funciona la autenticación

```
src/
├── app/                    Rutas (Expo Router)
│   ├── _layout.tsx         AuthProvider + Stack.Protected (una sección por rol; login sin sesión)
│   ├── login.tsx           → screens/LoginScreen
│   ├── register.tsx        → screens/RegisterScreen
│   ├── (app)/              Pasajero; pestañas inferiores (_layout.tsx)
│   │   ├── index.tsx       → screens/MapScreen    (pestaña Mapa)
│   │   ├── complaints.tsx  Mis Reclamos (pestaña Reclamos)
│   │   ├── profile.tsx     → screens/ProfileScreen (pestaña Perfil)
│   │   └── settings.tsx    → screens/SettingsScreen (pestaña Configuración)
│   ├── company/            Empresa: dashboard, modo conductor, micros, rutas, reclamos
│   └── admin/              Administración: dashboard, empresas, rutas, usuarios, reclamos
├── auth/
│   ├── AuthContext.tsx     Estado de sesión: restaurar al abrir, signIn, signUp, signOut
│   ├── jwt.ts              Lee el vencimiento ("exp") del access token, sin verificar firma
│   └── validation.ts       Mismas reglas que backend-go (email, contraseña ≥ 8)
├── api/
│   ├── interceptor.ts      Interceptor global: Bearer token, renueva antes de que venza
│   │                       o ante un 401 en /auth/refresh y reintenta (JSON, FormData, imágenes)
│   ├── client.ts           apiRequest: solicitudes JSON sobre el interceptor
│   ├── errors.ts           ApiError y mensajes de error en español
│   └── authApi.ts          login, register, restoreSession, logout
└── storage/
    └── tokenStorage.ts     accessToken y refreshToken en expo-secure-store
```

- **Almacenamiento:** `accessToken` y `refreshToken` se guardan con `expo-secure-store`
  (Keychain en iOS, cifrado con Android Keystore en Android), con
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: solo se leen con el teléfono desbloqueado y no
  pasan a respaldos ni a otro dispositivo. Nunca se usa AsyncStorage.
- **Al abrir la app** se recupera la sesión guardada (`GET /auth/me`). Si no se puede
  por una falla pasajera (sin conexión, 429 o 5xx, ver la tabla de abajo), se muestra
  el login con el aviso y el botón **Reintentar conexión**, y los tokens se conservan:
  al reintentar con el backend disponible se entra sin escribir la contraseña. Con 429
  el botón muestra "Reintentar en N s" hasta que pasa el `Retry-After`; el formulario
  de login sigue disponible, porque ese límite es el de renovar tokens, no el de login.
- **Renovación:** el access token dura ~15 min. Toda solicitud autenticada pasa por
  `authFetch` (`api/interceptor.ts`): ante un 401 llama a `POST /auth/refresh`, guarda
  el par nuevo (backend-go rota el refresh token) y reintenta una vez. Las renovaciones
  simultáneas comparten una sola llamada. Para JSON se usa `apiRequest` (`api/client.ts`);
  para subir archivos se llama a `authFetch` con una función que arma el `FormData`, así
  el reintento envía uno nuevo.
- **401 que llega tarde:** si una solicitud salió con un token que otra ya renovó
  mientras esta esperaba su respuesta, al recibir el 401 se reintenta con el token
  guardado, **sin** pedir otro refresh (`tokenForRetry` en `api/interceptor.ts`). Así
  se evita rotar los tokens de más y sumar intentos al límite de renovaciones de
  backend-go (429), algo fácil de alcanzar con varias pantallas consultando a la vez.
  Solo se vuelve a renovar si el token guardado sigue siendo el que se envió (por
  ejemplo, porque la renovación anterior falló). Si el reintento con el token ya
  renovado también da 401, la sesión se cierra.
- **Renovación anticipada:** para no gastar una solicitud en un 401, el access token se
  renueva **antes** de que venza, leyendo su vencimiento (`exp`) en `auth/jwt.ts`. La
  app no verifica la firma: es solo una pista, y la validez real la decide backend-go.
  - **Antes de enviar** (`renewAhead`): si le queda 1 minuto o menos
    (`EXPIRY_MARGIN_MS`), primero se renueva y la solicitud sale una sola vez con el
    token nuevo. Si el refresh falla por algo pasajero y el token todavía no vence, se
    envía igual con él; si ya venció, se entrega el error sin enviar una solicitud que
    daría 401. Si el refresh responde que la sesión no sirve, se cierra.
  - **Al volver a la app** (`AuthContext`, con `AppState`): si hay sesión y el token
    está por vencer, se renueva en segundo plano (`renewIfExpiringSoon`). Nunca muestra
    errores: con una falla pasajera no hace nada y la próxima solicitud lo reintenta.
  - **Reloj del teléfono desajustado:** el vencimiento se compara con la hora del
    teléfono. Si está adelantada, todo token parecería vencido y se pediría un refresh
    antes de cada solicitud. Por eso, si un token **recién emitido** ya aparece "por
    vencer", la renovación anticipada se desactiva y se renueva solo ante el 401, que
    no depende del reloj. Se reactiva sola cuando un refresh entrega un token con tiempo
    normal. Lo mismo pasa si backend-go emite tokens de menos de 1 minuto
    (`JWT_ACCESS_EXPIRES_IN`).
  - Si no se puede leer el vencimiento del token, no se renueva antes: queda el 401.
- **Sesión expirada:** la sesión se cierra solo si el refresh token ya no sirve. Una
  falla pasajera del servidor no saca al usuario (`isSessionInvalid` en
  `api/interceptor.ts`):

  | Respuesta de `POST /auth/refresh` | Qué significa | Qué hace la app |
  |---|---|---|
  | 401 | Refresh token inválido, vencido, ya usado o revocado | Borra los tokens y vuelve al login (sin aviso de error) |
  | 400 | No se envió el refresh token | Igual que 401 |
  | 429 | Límite de renovaciones del backend | Conserva la sesión; muestra el mensaje y cuántos segundos esperar |
  | 500, 502, 503 | Falla del servidor (ej. 503 si no puede consultar la lista de revocados) | Conserva la sesión y muestra el mensaje del servidor |
  | Sin respuesta | Sin conexión o timeout | Conserva la sesión; "No se pudo conectar con el servidor…" |
  | 200 sin tokens | Respuesta incompleta (cuerpo vacío o cortado) | No guarda nada, conserva la sesión y lo trata como 502 |

  Con una falla pasajera el refresh token no se consumió: la siguiente solicitud
  vuelve a renovar con el mismo token. Si el reintento después de renovar vuelve a
  dar 401, también se cierra la sesión.
- **Cerrar sesión** (botón en la pestaña Perfil, con confirmación): `POST /auth/logout`
  envía el access token (header) y el refresh token (body) a la **lista negra** de
  backend-go, que los rechaza desde ese momento aunque no hayan vencido. Los tokens
  locales se borran siempre; si el servidor no pudo confirmarlo (ej. sin conexión),
  el login muestra un aviso, porque esos tokens siguen vigentes hasta que expiren.
  El backend solo acepta en el body un refresh token firmado por él y del mismo usuario.
- **Límite de intentos:** si backend-go responde 429 (rate limiting), el formulario
  muestra el mensaje y bloquea el botón con cuenta regresiva hasta el `Retry-After`.

## Pruebas en vivo contra backend-go

Además de los tests unitarios (`npm test`, con `fetch` simulado), hay pruebas que
usan el código real de la sesión (`authApi`, el interceptor y el almacenamiento de
tokens) contra un **backend-go real** levantado con access tokens de 5 segundos. Así
se comprueba de verdad el vencimiento, el 401, la rotación del refresh token y la
lista negra.

**Requisitos:** Go instalado, PostgreSQL corriendo y una base de datos **de prueba**
vacía. El backend le aplica las migraciones y crea los usuarios de prueba (seed) al
iniciar; no hace falta correr ningún SQL.

```bash
psql -U postgres -c "CREATE DATABASE transithub_live;"
cd mobile
LIVE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transithub_live npm run test:live:backend
```

En PowerShell:

```powershell
cd mobile
$env:LIVE_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/transithub_live"
npm run test:live:backend
```

Tarda alrededor de un minuto (compila el backend y algunas pruebas esperan a que el
token venza). Para correr solo algunas, los argumentos pasan a Jest:
`npm run test:live:backend -- -t "rotación"`.

**Qué hace `scripts/live-backend.mjs`:**

1. Compila backend-go a un ejecutable temporal.
2. Lo levanta en `http://127.0.0.1:3995` desde una carpeta temporal, para **no leer
   `backend-go/.env`**: usa siempre la base indicada, revocados en memoria (sin
   Redis), la simulación de micros encendida (publica `bus:update` por `/ws`) y
   `JWT_ACCESS_EXPIRES_IN=5s`.
3. Espera a que responda `/health` y corre `jest -c jest.live.config.js`.
4. Detiene el backend al terminar (también con Ctrl+C) y borra lo temporal. Si algo
   falla, conserva el log del backend y muestra dónde quedó.

**Protecciones:** no corre sin `LIVE_DATABASE_URL`, con una URL inválida ni contra
`transporte_db` (la base de desarrollo). Conviene usar una base solo para esto: el
seed y las migraciones la modifican.

| Variable | Por defecto | Uso |
|---|---|---|
| `LIVE_DATABASE_URL` | (obligatoria) | Base de prueba |
| `LIVE_PORT` | `3995` | Puerto del backend de prueba |
| `LIVE_JWT_ACCESS_EXPIRES_IN` | `5s` | Duración del access token |

**Diferencias con el backend normal:** los límites de intentos de login y de
renovación de tokens se suben solo en este backend de prueba, porque las pruebas
inician sesión y renuevan decenas de veces en segundos (un usuario real renueva cada
~15 min). Los limitadores siguen activos; cómo reacciona la app a un 429 se prueba en
los tests unitarios.

**Qué cubren** (`src/**/*.live.test.ts`, de a un archivo porque comparten backend):

| Archivo | Comprueba |
|---|---|
| `test-utils/__tests__/liveSetup.live.test.ts` | Que la configuración hace solicitudes HTTP reales (no necesita backend) |
| `auth/__tests__/session.live.test.ts` | Login con el pasajero del seed, contraseña incorrecta, `GET /auth/me` y que tras el logout backend-go rechaza el access token |
| `api/__tests__/refresh.live.test.ts` | Token vencido → 401 → refresh → reintento; solicitudes simultáneas con un solo refresh; el refresh token anterior queda rechazado; con uno ya usado se cierra la sesión |
| `api/__tests__/proactive.live.test.ts` | Renovar antes de enviar (sin 401); la protección contra el reloj desajustado; renovar al volver a la app (`renewIfExpiringSoon`) |
| `api/__tests__/revocation.live.test.ts` | Sesión cerrada desde otro dispositivo; logout con el access token vencido (revoca el par nuevo); logout con tokens ya revocados |
| `realtime/__tests__/realtime.live.test.ts` | Conexión al WebSocket `/ws`, suscripción a una línea y recepción de sus micros (`bus:update`) |

Las pruebas revisan la secuencia exacta de solicitudes que recibe el backend (ej.
`/auth/me 401` → `/auth/refresh 200` → `/auth/me 200`), no solo el resultado final.

**Por qué una configuración de Jest aparte (`jest.live.config.js`):** en el preset
`jest-expo`, el `fetch` global es el de Expo, que en Jest no hace solicitudes. La
configuración en vivo usa Node puro, con su `fetch` real, y los mismos mocks de
`__mocks__` (ej. `expo-secure-store` en memoria). `npm test` no incluye los
`*.live.test.ts`, y `npm run test:live` a secas (sin backend) los omite.

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
- `src/components/LocationCard.tsx` (pantalla Mapa): estado, coordenadas y
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
- `src/components/NearbyStopCard.tsx` (pantalla Mapa): paradero más cercano,
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
- `src/components/ProximityAlertsCard.tsx` (pantalla Mapa): aviso con vibración
  ("La micro ABCD12 está a 350 m de Plaza de Armas."), micros que se acercan y
  botón **Buscar micros ahora**.

Las alertas siempre se muestran en la app. Además respetan la Configuración:
**Vibración** (vibrar o no) y **Notificaciones push** (también como notificación
del teléfono). Ver "Notificaciones" más abajo.

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
- `src/screens/SettingsScreen.tsx` (pestaña **Configuración**): sección
  *Notificaciones* (interruptores de notificaciones push y vibración) y sección
  *Interfaz* (tema Sistema / Claro / Oscuro y tamaño del texto Normal / Grande /
  Muy grande), más **Restablecer valores por defecto** con confirmación.
- Componentes reutilizables: `SettingSwitchRow` (fila con interruptor) y
  `SegmentedControl` (elegir una opción entre pocas; para el lector de pantalla
  es un grupo de radios).

### Tema claro / oscuro

- `src/theme/colors.ts`: paletas `lightColors` y `darkColors` con los mismos nombres
  de color. Todos los pares de texto y fondo cumplen contraste WCAG AA (≥ 4.5:1),
  comprobado en `colors.test.ts`. En oscuro el azul se aclara y el texto sobre él
  (`onPrimary`) se oscurece.
- `src/theme/ThemeContext.tsx`: `ThemeProvider` aplica la preferencia de
  Configuración; con **Sistema** sigue el modo del teléfono en vivo
  (`app.json` → `"userInterfaceStyle": "automatic"`). `useTheme()` entrega
  `{ scheme, colors }` (sin provider, tema claro).
- Estilos con el tema: `makeStyles` reemplaza a `StyleSheet.create`. Recibe los
  colores y `font(n)`, que escala tamaños de letra e interlineados. Los estilos se
  crean una vez por combinación de tema y tamaño de texto:

  ```tsx
  const useStyles = makeStyles((colors, font) => ({
    title: { color: colors.text, fontSize: font(16) },
  }));

  function Titulo() {
    const styles = useStyles();
    return <Text style={styles.title}>Hola</Text>;
  }
  ```

- La navegación (cabeceras, pestañas, fondo entre pantallas), la barra de estado y
  el teclado de iOS también siguen el tema.

### Tamaño del texto

- Normal ×1, Grande ×1.15, Muy grande ×1.3 (`TEXT_SCALES`). Se suma al tamaño de
  letra configurado en el teléfono (Accesibilidad), que React Native ya respeta.
- Todos los `fontSize` y `lineHeight` usan `font(n)`, también el título de la
  cabecera y las etiquetas de las pestañas. No hay contenedores de alto fijo con
  texto. En el selector de opciones las etiquetas pueden usar dos líneas, y las
  iniciales del avatar (círculo fijo de 88 px) limitan el aumento del sistema.
- En Configuración, una vista previa muestra el tamaño elegido.

### Notificaciones

- `src/notifications/notificationService.ts` (`expo-notifications`): permiso
  (`granted`, `undetermined`, `denied`, `blocked`, igual que la ubicación) y
  notificación inmediata de cada alerta de proximidad ("Tu micro se acerca").
  Las notificaciones se muestran también con la app abierta. En Android hay dos
  canales, con y sin vibración, según la preferencia **Vibración**.
- `src/hooks/useNotificationPreference.ts`: el interruptor de Configuración pide el
  permiso al activarlo y solo guarda la preferencia si se concede. Si el permiso
  está bloqueado, ofrece **Abrir ajustes**. Al volver a la app revisa el permiso:
  si el usuario lo quitó desde el teléfono, lo avisa.
- Con las notificaciones activas, **Enviar notificación de prueba** muestra una de
  ejemplo al instante, con o sin vibración según la preferencia. Sirve para
  comprobar el permiso sin esperar una micro real.
- Son **notificaciones locales**: las crea la app mientras está abierta y consulta
  las micros, y funcionan en Expo Go. Con la app cerrada no llegan. Para eso harían
  falta notificaciones push enviadas desde el servidor, que requieren un build con
  EAS (Expo Go en Android ya no las permite) y un endpoint en backend-go para
  registrar el token del dispositivo.

## Perfil

La pestaña **Perfil** muestra avatar con iniciales, nombre, tipo de cuenta, correo,
estado de la cuenta y fecha de registro. Los datos se piden a `GET /auth/me` al
entrar y al deslizar hacia abajo; si falla (ej. sin conexión), se conservan los
datos ya cargados y se muestra un aviso.

`expo-secure-store` no funciona en la versión web; la app está pensada para iOS y Android.
