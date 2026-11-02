import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, spacing } from '../theme';

/** Cuentas que crea el seed de backend-go (las mismas del login del web). */
export const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@transporte.cl', password: 'admin12345', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)' },
  {
    label: 'Pasajero',
    email: 'carlos.pasajero@gmail.com',
    password: 'Pasajero1234!',
    color: '#4ade80',
    background: 'rgba(74, 222, 128, 0.1)',
  },
] as const;

export interface DemoAccountsProps {
  onFill: (email: string, password: string) => void;
}

/** "Cuentas de prueba simuladas" del login del web: rellenan el formulario. */
export function DemoAccounts({ onFill }: DemoAccountsProps) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>CUENTAS DE PRUEBA SIMULADAS (CON HASH BCRYPT):</Text>
      <View style={styles.row}>
        {DEMO_ACCOUNTS.map((account) => (
          <Pressable
            key={account.label}
            accessibilityRole="button"
            accessibilityLabel={`Usar cuenta de prueba ${account.label}`}
            onPress={() => onFill(account.email, account.password)}
            style={[styles.chip, { borderColor: account.color, backgroundColor: account.background }]}
          >
            <Text style={[styles.chipText, { color: account.color }]}>{account.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Web: margen 20, línea superior, etiqueta 11 px; botones 4×8 px, 11 px, radio 6.
const useStyles = makeStyles((colors, font) => ({
  container: { marginTop: 20, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  label: { fontSize: font(11), lineHeight: font(18), color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.sm },
  chipText: { fontSize: font(11), lineHeight: font(18) },
}));
