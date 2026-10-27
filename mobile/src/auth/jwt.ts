/**
 * Lectura del vencimiento de los JWT de backend-go (claim "exp", en segundos).
 *
 * NO verifica la firma: solo sirve como pista para renovar el access token
 * antes de que venza. La validez real la decide siempre el backend (401).
 */

/** Margen antes del vencimiento en que conviene renovar. */
export const EXPIRY_MARGIN_MS = 60_000;

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Decodifica base64url a una cadena de bytes; null si no es base64url válido. */
function decodeBase64Url(input: string): string | null {
  if (input.length % 4 === 1) {
    return null;
  }
  let bits = 0;
  let value = 0;
  let output = '';
  for (const char of input) {
    const index = BASE64URL.indexOf(char);
    if (index === -1) {
      return null;
    }
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Momento en que vence el JWT (ms desde 1970, como Date.now()), según su claim
 * "exp". null si el token no tiene ese formato o no trae un "exp" numérico.
 */
export function getTokenExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  const payload = decodeBase64Url(parts[1]);
  if (payload === null) {
    return null;
  }
  try {
    // Los textos con tildes quedan mal decodificados (bytes UTF-8), pero el
    // JSON sigue siendo válido y "exp" es un número.
    const exp = JSON.parse(payload)?.exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * true si el token vence dentro de `marginMs` (o ya venció) según el reloj del
 * dispositivo. Si no se puede leer el vencimiento devuelve false: se deja que
 * el backend responda 401 y el interceptor renueve como siempre.
 */
export function isExpiringSoon(token: string, now: number = Date.now(), marginMs: number = EXPIRY_MARGIN_MS): boolean {
  const expiry = getTokenExpiry(token);
  return expiry !== null && expiry - now <= marginMs;
}
