import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

/** Campo de texto con etiqueta y mensaje de error accesibles. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField({ label, error, style, ...props }, ref) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
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
  container: { marginBottom: spacing.md },
  label: { fontSize: font(14), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font(16),
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs, color: colors.danger, fontSize: font(13) },
}));
