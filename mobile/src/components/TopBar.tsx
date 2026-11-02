import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignOut } from '../hooks/useSignOut';
import { BRAND_GRADIENT, makeStyles, radius, spacing } from '../theme';
import { Brand } from './Brand';
import { GradientText } from './GradientText';

export type TopBarVariant = 'passenger' | 'company' | 'admin';

/** "ADMINISTRACIÓN" del panel del web: --color-primary-400 → hsl(199, 89%, 60%). */
const ADMIN_GRADIENT = [BRAND_GRADIENT[0], '#3ebaf4'] as const;

/**
 * Barra superior de cada sección, como el web:
 * - pasajero: la barra de PassengerLayout (marca con degradado y botón ovalado);
 * - empresa y administración: la cabecera de su menú lateral (que el web
 *   convierte en barra superior en pantallas angostas), con la bajada
 *   "Panel de empresa" o "ADMINISTRACIÓN".
 */
export function TopBar({ variant }: { variant: TopBarVariant }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { signingOut, confirmSignOut } = useSignOut();
  const passenger = variant === 'passenger';

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      {passenger ? (
        <Brand />
      ) : (
        <View style={styles.brandRow}>
          <Text style={styles.logo} importantForAccessibility="no" accessibilityElementsHidden>
            🚌
          </Text>
          <View>
            <Text style={variant === 'admin' ? styles.titleAdmin : styles.title}>TransitHub</Text>
            {variant === 'admin' ? (
              <GradientText style={styles.adminTag} colors={ADMIN_GRADIENT} direction="horizontal">
                ADMINISTRACIÓN
              </GradientText>
            ) : (
              <Text style={styles.companyTag}>Panel de empresa</Text>
            )}
          </View>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
        disabled={signingOut}
        onPress={confirmSignOut}
        style={({ pressed }) => [
          passenger ? styles.logoutPill : styles.logoutPanel,
          pressed ? styles.logoutPressed : null,
          signingOut ? styles.logoutBusy : null,
        ]}
      >
        {({ pressed }) => <Text style={[styles.logoutText, pressed ? styles.logoutTextPressed : null]}>Cerrar sesión</Text>}
      </Pressable>
    </View>
  );
}

// Web: barra --color-surface-1 con borde inferior; botón del pasajero
// transparente, ovalado, borde y texto secundario (rojo al presionar, como su
// :hover); el del panel, rectangular sobre --color-surface-2.
const useStyles = makeStyles((colors, font) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { fontSize: font(24) },
  title: { fontSize: font(18), fontWeight: '700', color: colors.text },
  titleAdmin: { fontSize: font(18), fontWeight: '800', color: colors.text, letterSpacing: -0.36 },
  companyTag: { fontSize: font(12), color: colors.placeholder, marginTop: 2 },
  adminTag: { fontSize: font(12), fontWeight: '600', letterSpacing: 0.96, marginTop: 2 },
  logoutPill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutPanel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  logoutPressed: { borderColor: colors.danger },
  logoutBusy: { opacity: 0.6 },
  logoutText: { fontSize: font(14), fontWeight: '600', color: colors.muted },
  logoutTextPressed: { color: colors.danger },
}));
