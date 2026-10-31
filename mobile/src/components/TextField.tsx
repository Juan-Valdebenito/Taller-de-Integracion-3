import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

/** Campo de texto con etiqueta y mensaje de error accesibles (estilo de los formularios del web). */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField({ label, error, style, ...props }, ref) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        keyboardAppearance={scheme}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((colors, font) => ({
  // Web: separación de 14 px entre campos, etiqueta 13 px/600, campo 10×12 px
  // con radio 8 sobre --color-surface-2.
  container: { marginBottom: 14 },
  label: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: font(14),
    color: colors.text,
    backgroundColor: colors.field,
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs, color: colors.danger, fontSize: font(13) },
}));
