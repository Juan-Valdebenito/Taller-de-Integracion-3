import { Text, View } from 'react-native';

import { BRAND_GRADIENT, makeStyles, spacing } from '../theme';
import { GradientText } from './GradientText';

/** Marca de la barra superior del web: 🚌 + "TransitHub" con degradado azul. */
export function Brand() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.logo} importantForAccessibility="no" accessibilityElementsHidden>
        🚌
      </Text>
      <GradientText style={styles.title} colors={BRAND_GRADIENT}>
        TransitHub
      </GradientText>
    </View>
  );
}

// Web: .navLogo 1.5rem; .navTitle --font-size-lg (1.125rem), 700.
const useStyles = makeStyles((_colors, font) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { fontSize: font(24) },
  title: { fontSize: font(18), fontWeight: '700' },
}));
