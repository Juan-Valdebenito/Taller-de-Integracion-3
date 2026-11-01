import { accessTokenExpiringIn, base64Url, makeJwt } from '../../test-utils/jwt';
import { EXPIRY_MARGIN_MS, getTokenExpiry, isExpiringSoon } from '../jwt';

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const accessToken = (expiresInSeconds: number, extra: object = {}) => accessTokenExpiringIn(expiresInSeconds, NOW, extra);

describe('getTokenExpiry', () => {
  it('lee el vencimiento de un access token de backend-go en milisegundos', () => {
    expect(getTokenExpiry(accessToken(15 * 60))).toBe(NOW + 15 * 60 * 1000);
  });

  it('decodifica payloads de cualquier largo (con y sin relleno base64)', () => {
    for (const name of ['A', 'An', 'Ana', 'Anaa', 'Anaaa']) {
      expect(getTokenExpiry(accessToken(60, { name }))).toBe(NOW + 60_000);
    }
  });

  it('lee el vencimiento aunque el payload tenga tildes o eñes', () => {
    expect(getTokenExpiry(accessToken(60, { name: 'Íñigo Peña' }))).toBe(NOW + 60_000);
  });

  it('acepta un exp con decimales', () => {
    expect(getTokenExpiry(makeJwt({ exp: 1_800_000_000.5 }))).toBe(1_800_000_000_500);
  });

  it.each([
    ['vacío', ''],
    ['sin puntos', 'abc'],
    ['con dos partes', 'abc.def'],
    ['con cuatro partes', 'a.b.c.d'],
    ['con payload vacío', 'abc..firma'],
    ['con caracteres que no son base64url', 'abc.$$$$.firma'],
    ['con un largo base64 imposible', 'abc.a.firma'],
    ['con payload que no es JSON', `abc.${base64Url('no es json')}.firma`],
    ['con payload JSON que no es objeto', makeJwt(null)],
    ['sin exp', makeJwt({ id: 'u1' })],
    ['con exp de texto', makeJwt({ exp: '1800000000' })],
    ['con exp infinito', `abc.${base64Url('{"exp":1e999}')}.firma`],
  ])('devuelve null con un token %s', (_kind, token) => {
    expect(getTokenExpiry(token)).toBeNull();
  });
});

describe('isExpiringSoon', () => {
  it('un token recién emitido (15 min) no vence pronto', () => {
    expect(isExpiringSoon(accessToken(15 * 60), NOW)).toBe(false);
  });

  it('vence pronto si le queda el margen o menos', () => {
    expect(isExpiringSoon(accessToken(EXPIRY_MARGIN_MS / 1000 + 1), NOW)).toBe(false);
    expect(isExpiringSoon(accessToken(EXPIRY_MARGIN_MS / 1000), NOW)).toBe(true);
    expect(isExpiringSoon(accessToken(10), NOW)).toBe(true);
  });

  it('un token ya vencido vence pronto', () => {
    expect(isExpiringSoon(accessToken(-5), NOW)).toBe(true);
  });

  it('acepta otro margen', () => {
    expect(isExpiringSoon(accessToken(90), NOW, 120_000)).toBe(true);
    expect(isExpiringSoon(accessToken(90), NOW, 30_000)).toBe(false);
  });

  it('si no se puede leer el vencimiento, no lo da por vencido (se deja al 401)', () => {
    expect(isExpiringSoon('no-es-un-jwt', NOW)).toBe(false);
    expect(isExpiringSoon(makeJwt({ id: 'u1' }), NOW)).toBe(false);
  });

  it('usa el reloj del dispositivo si no se indica la hora', () => {
    jest.useFakeTimers({ now: NOW });
    try {
      expect(isExpiringSoon(accessToken(30))).toBe(true);
      expect(isExpiringSoon(accessToken(15 * 60))).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
