/**
 * Jest para las pruebas EN VIVO contra backend-go real (archivos *.live.test.ts).
 *
 * No usa el preset jest-expo: ahí el fetch global es el de Expo, que en Jest no
 * hace solicitudes. Aquí el entorno es Node puro, con su fetch real, y los
 * mocks de __mocks__ (ej. expo-secure-store en memoria) funcionan igual.
 *
 *   EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1 npm run test:live
 */
const path = require('path');

const live = (file) => path.join(__dirname, 'src', 'test-utils', 'live', file);

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.live.test.ts'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: {
    // babel-preset-expo lee las EXPO_PUBLIC_* desde este módulo (es ESM).
    '^expo/virtual/env$': live('env.js'),
    // La lógica de sesión solo usa Platform.OS y Alert de react-native.
    '^react-native$': live('react-native.js'),
  },
  // El backend real responde en segundos; los tokens cortos obligan a esperar.
  testTimeout: 60_000,
};
