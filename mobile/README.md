# TransitHub — App móvil (React Native + Expo)

App para pasajeros. Por ahora incluye el **módulo de autenticación** (login,
registro, sesión persistente y cierre de sesión) contra `backend-go`.

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
│   └── (app)/index.tsx     → screens/HomeScreen (solo con sesión)
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
- **Cerrar sesión:** `POST /auth/logout` revoca el access y el refresh token en el
  servidor; los tokens locales se borran aunque no haya conexión.
- **Límite de intentos:** si backend-go responde 429 (rate limiting), el formulario
  muestra el mensaje y bloquea el botón con cuenta regresiva hasta el `Retry-After`.

`expo-secure-store` no funciona en la versión web; la app está pensada para iOS y Android.
