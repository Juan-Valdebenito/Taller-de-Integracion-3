import { INTER_FONTS } from '../fonts';
import { applyInter, INTER_FAMILIES, interFamily } from '../typography';

describe('interFamily', () => {
  it.each([
    [undefined, 'Inter_400Regular'],
    ['normal', 'Inter_400Regular'],
    ['bold', 'Inter_700Bold'],
    ['500', 'Inter_500Medium'],
    ['600', 'Inter_600SemiBold'],
    ['700', 'Inter_700Bold'],
    ['800', 'Inter_800ExtraBold'],
    [700, 'Inter_700Bold'],
  ] as const)('fontWeight %p → %s', (weight, family) => {
    expect(interFamily(weight)).toBe(family);
  });

  it('un grosor no cargado usa el más cercano', () => {
    expect(interFamily('300')).toBe('Inter_400Regular');
    expect(interFamily('900')).toBe('Inter_800ExtraBold');
  });

  it('un valor desconocido usa el regular', () => {
    expect(interFamily('ultralight' as never)).toBe('Inter_400Regular');
  });

  it('cada familia que usan los estilos se carga en useFonts', () => {
    expect(Object.keys(INTER_FONTS).sort()).toEqual(Object.values(INTER_FAMILIES).sort());
  });
});

describe('applyInter', () => {
  it('cambia el fontWeight de los estilos de texto por la familia de ese grosor', () => {
    expect(
      applyInter({
        title: { fontSize: 24, fontWeight: '700', color: '#fff' },
        body: { fontSize: 16 },
        label: { fontWeight: '600' },
      }),
    ).toEqual({
      title: { fontSize: 24, color: '#fff', fontFamily: 'Inter_700Bold' },
      body: { fontSize: 16, fontFamily: 'Inter_400Regular' },
      label: { fontFamily: 'Inter_600SemiBold' },
    });
  });

  it('no toca estilos sin texto ni los que ya eligen su fuente', () => {
    const styles = {
      card: { padding: 24, borderRadius: 12 },
      emoji: { fontSize: 24, fontFamily: 'System', fontWeight: '400' as const },
    };
    expect(applyInter(styles)).toEqual(styles);
  });

  it('no modifica el objeto que recibe', () => {
    const styles = { title: { fontSize: 18, fontWeight: '700' as const } };
    applyInter(styles);
    expect(styles.title).toEqual({ fontSize: 18, fontWeight: '700' });
  });
});
