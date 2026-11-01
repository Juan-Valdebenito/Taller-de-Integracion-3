/**
 * Utilidades de test: JWT con el formato de backend-go. La firma es falsa
 * (la app no la verifica; solo lee "exp").
 */

/** Texto a base64url sin relleno (UTF-8), como codifica los JWT backend-go. */
export function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JWT con el payload dado. */
export function makeJwt(payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string {
  const encode = (value: unknown) => base64Url(JSON.stringify(value));
  return `${encode(header)}.${encode(payload)}.firma`;
}

/**
 * Access token como los de backend-go (handler.AuthHandler: exp e iat en
 * segundos) que vence `expiresInSeconds` después de `now`.
 */
export function accessTokenExpiringIn(expiresInSeconds: number, now: number = Date.now(), extra: object = {}): string {
  return makeJwt({
    id: 'u1',
    email: 'ana@correo.cl',
    role: 'PASSENGER',
    type: 'access',
    jti: 'abc',
    iat: now / 1000,
    exp: now / 1000 + expiresInSeconds,
    ...extra,
  });
}
