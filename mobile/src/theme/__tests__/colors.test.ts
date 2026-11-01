import { darkColors, lightColors, type ThemeColors } from '../colors';

/** Contraste WCAG 2.x entre dos colores #rrggbb. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Pares texto/fondo que usa la app (ver componentes y pantallas). */
const TEXT_PAIRS: Array<[keyof ThemeColors, keyof ThemeColors]> = [
  ['text', 'background'],
  ['text', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['muted', 'successBg'],
  ['muted', 'warningBg'],
  ['text', 'successBg'],
  ['text', 'warningBg'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'danger'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['danger', 'dangerBg'],
  ['warning', 'warningBg'],
];

describe.each([
  ['claro', lightColors],
  ['oscuro', darkColors],
])('paleta %s', (_name, colors) => {
  it.each(TEXT_PAIRS)('%s sobre %s cumple contraste WCAG AA (≥ 4.5:1)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('todos los colores son #rrggbb', () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

it('ambas paletas definen los mismos colores', () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
});

it('la función de contraste da los valores conocidos', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
});
