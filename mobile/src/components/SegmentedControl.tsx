import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, spacing } from '../theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Nombre del grupo para el lector de pantalla (ej. "Tema"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Selector de una opción entre pocas (ej. Sistema / Claro / Oscuro). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={[styles.option, selected && styles.selected]}
          >
            {/* Sin límite de líneas: con texto grande la etiqueta puede ocupar dos. */}
            <Text style={[styles.text, selected && styles.selectedText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  group: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    marginTop: spacing.sm,
  },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  selected: { backgroundColor: colors.primary },
  text: { fontSize: font(14), fontWeight: '600', color: colors.text, textAlign: 'center' },
  selectedText: { color: colors.onPrimary },
}));
