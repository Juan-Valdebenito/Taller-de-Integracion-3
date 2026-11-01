/**
 * Tipografía: Inter, la misma fuente del frontend web.
 *
 * Con @expo-google-fonts cada grosor es una familia propia (Inter_700Bold…):
 * fontWeight no elige la variante, y en Android incluso la engrosaría de
 * nuevo. Por eso makeStyles cambia el fontWeight de cada estilo de texto por
 * la familia de ese grosor (applyInter). Las fuentes se cargan en app/_layout.
 */
import type { TextStyle } from 'react-native';

/** Grosores cargados (los que usa el frontend web) → familia de Inter. */
export const INTER_FAMILIES = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
} as const;

type LoadedWeight = keyof typeof INTER_FAMILIES;
const LOADED: LoadedWeight[] = [400, 500, 600, 700, 800];

/** Familia de Inter para un fontWeight (el grosor cargado más cercano). */
export function interFamily(weight: TextStyle['fontWeight'] = 'normal'): string {
  const numeric = weight === 'normal' ? 400 : weight === 'bold' ? 700 : Number(weight);
  if (!Number.isFinite(numeric)) {
    return INTER_FAMILIES[400];
  }
  const closest = LOADED.reduce((best, w) => (Math.abs(w - numeric) < Math.abs(best - numeric) ? w : best));
  return INTER_FAMILIES[closest];
}

/**
 * A cada estilo de texto (con fontSize o fontWeight y sin fontFamily propio)
 * le pone la familia de Inter de su grosor y le quita el fontWeight.
 */
export function applyInter<S extends Record<string, unknown>>(styles: S): S {
  const result: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(styles)) {
    if (style && typeof style === 'object' && !Array.isArray(style)) {
      const text = style as TextStyle;
      if ((text.fontSize !== undefined || text.fontWeight !== undefined) && text.fontFamily === undefined) {
        const { fontWeight, ...rest } = text;
        result[name] = { ...rest, fontFamily: interFamily(fontWeight) };
        continue;
      }
    }
    result[name] = style;
  }
  return result as S;
}
