import { Switch, Text, View } from 'react-native';

import { makeStyles, spacing, useTheme } from '../theme';

export interface SettingSwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/** Fila de configuración con título, descripción e interruptor. */
export function SettingSwitchRow({ label, description, value, onValueChange, disabled = false }: SettingSwitchRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.border }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  text: { flex: 1 },
  label: { fontSize: font(16), fontWeight: '600', color: colors.text },
  description: { marginTop: 2, fontSize: font(13), color: colors.muted, lineHeight: font(18) },
}));
