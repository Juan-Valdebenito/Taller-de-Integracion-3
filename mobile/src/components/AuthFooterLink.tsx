import { Text } from 'react-native';

import { makeStyles, spacing } from '../theme';

export interface AuthFooterLinkProps {
  /** Texto antes del enlace, ej. "¿No tienes cuenta?". */
  prompt: string;
  /** Texto del enlace, ej. "Regístrate aquí". */
  link: string;
  onPress: () => void;
}

/** Pie de Login y Registro del web: texto secundario 12 px y enlace celeste. */
export function AuthFooterLink({ prompt, link, onPress }: AuthFooterLinkProps) {
  const styles = useStyles();
  return (
    <Text style={styles.footer}>
      {prompt}{' '}
      <Text style={styles.link} accessibilityRole="link" onPress={onPress}>
        {link}
      </Text>
    </Text>
  );
}

const useStyles = makeStyles((colors, font) => ({
  footer: { marginTop: spacing.md, fontSize: font(12), lineHeight: font(19), color: colors.muted },
  link: { color: colors.accent, fontWeight: '600' },
}));
