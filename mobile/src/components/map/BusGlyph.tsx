import { View } from 'react-native';

/** Silueta frontal vectorial de una micro, dibujada con Views nativas. */
export function BusGlyph({ color, size = 18 }: { color: string; size?: number }) {
  const bodyWidth = size * 0.84;
  const bodyHeight = size * 0.94;
  const wheelWidth = Math.max(2, size * 0.13);
  const wheelHeight = Math.max(4, size * 0.24);
  return (
    <View style={{ width: size + 6, height: size + 6, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <View style={{ position: 'absolute', left: 1, top: size * 0.3, width: wheelWidth, height: wheelHeight, borderRadius: wheelWidth, backgroundColor: '#111827' }} />
      <View style={{ position: 'absolute', right: 1, top: size * 0.3, width: wheelWidth, height: wheelHeight, borderRadius: wheelWidth, backgroundColor: '#111827' }} />
      <View style={{ position: 'absolute', left: 1, bottom: size * 0.22, width: wheelWidth, height: wheelHeight, borderRadius: wheelWidth, backgroundColor: '#111827' }} />
      <View style={{ position: 'absolute', right: 1, bottom: size * 0.22, width: wheelWidth, height: wheelHeight, borderRadius: wheelWidth, backgroundColor: '#111827' }} />
      <View
        style={{
          width: bodyWidth,
          height: bodyHeight,
          alignItems: 'center',
          borderWidth: 1.3,
          borderColor: '#ffffff',
          borderRadius: size * 0.2,
          backgroundColor: color,
          paddingTop: size * 0.14,
        }}
      >
        <View style={{ width: bodyWidth * 0.66, height: size * 0.23, borderRadius: 2, backgroundColor: '#172033' }} />
        <View style={{ width: bodyWidth * 0.66, height: size * 0.14, marginTop: size * 0.1, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.92)' }} />
        <View style={{ width: bodyWidth * 0.5, height: size * 0.08, marginTop: size * 0.08, borderRadius: 2, backgroundColor: '#172033' }} />
      </View>
      <View style={{ position: 'absolute', top: size * 0.14, left: size * 0.36, width: size * 0.1, height: size * 0.09, borderRadius: 2, backgroundColor: '#fef3c7' }} />
      <View style={{ position: 'absolute', top: size * 0.14, right: size * 0.36, width: size * 0.1, height: size * 0.09, borderRadius: 2, backgroundColor: '#fef3c7' }} />
    </View>
  );
}
