import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Se ve en la lista pero no se puede elegir (como <option disabled> del web). */
  disabled?: boolean;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}

/**
 * Lista desplegable con el aspecto del <select> de los formularios del web:
 * muestra la opción elegida con una flecha y, al tocarla, abre las opciones.
 */
export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  const choose = (next: T) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected.label}`}
        accessibilityHint="Abre la lista de opciones"
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Text style={styles.value}>{selected.label}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Cerrar la lista" onPress={() => setOpen(false)}>
          {/* Pressable sin acción: un toque en la tarjeta no llega al fondo y no la cierra. */}
          <Pressable style={styles.sheet} accessibilityRole="radiogroup" accessibilityLabel={label} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {options.map((option) => {
              const checked = option.value === value;
              const disabled = option.disabled === true;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked, disabled }}
                  accessibilityLabel={option.label}
                  disabled={disabled}
                  onPress={() => choose(option.value)}
                  style={[styles.option, checked ? styles.optionChecked : null, disabled ? styles.optionDisabled : null]}
                >
                  <Text style={[styles.optionText, checked ? styles.optionTextChecked : null]}>{option.label}</Text>
                  {checked ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Mismo aspecto que TextField (campo 10×12 px, radio 8, --color-surface-2).
const useStyles = makeStyles((colors, font) => ({
  container: { marginBottom: 14 },
  label: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.field,
  },
  value: { fontSize: font(14), color: colors.text },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  sheetTitle: { fontSize: font(13), fontWeight: '600', color: colors.muted, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  optionChecked: { backgroundColor: colors.field },
  optionDisabled: { opacity: 0.45 },
  optionText: { fontSize: font(14), color: colors.text },
  optionTextChecked: { color: colors.accent, fontWeight: '600' },
}));
