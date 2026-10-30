import MaskedViewClass from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType, ReactElement } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewProps } from 'react-native';

// Los tipos de masked-view 0.3 declaran la clase como mezcla
// (Constructor<NativeMethods> & typeof Component), que TypeScript 6 no acepta
// como componente JSX. En ejecución es un componente normal.
const MaskedView = MaskedViewClass as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>;

export interface GradientTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  /** Colores del degradado. */
  colors: readonly [string, string, ...string[]];
  /** diagonal: 135° (marca del web) · horizontal: 90° ("ADMINISTRACIÓN" del panel). */
  direction?: 'diagonal' | 'horizontal';
}

/**
 * Texto con degradado (la marca "TransitHub" del web usa
 * `background-clip: text`). En iOS y Android el texto sirve de máscara sobre
 * un LinearGradient; la versión web está en GradientText.web.tsx.
 */
export function GradientText({ children, style, colors, direction = 'diagonal' }: GradientTextProps) {
  return (
    <MaskedView accessible accessibilityLabel={children} maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={direction === 'horizontal' ? { x: 1, y: 0 } : { x: 1, y: 1 }}>
        {/* Da el tamaño al degradado; invisible: lo que se ve es la máscara. */}
        <Text style={[style, { opacity: 0 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
