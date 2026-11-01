import { Text, View } from 'react-native';

import { makeStyles, spacing } from '../theme';

export interface PageTitleProps {
  /** Emoji delante del título, como en el web ("📋 Mis Reclamos"). */
  emoji?: string;
  title: string;
  subtitle?: string;
}

/** Encabezado de página del web: h1 --font-size-2xl 700 y bajada en texto secundario. */
export function PageTitle({ emoji, title, subtitle }: PageTitleProps) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {emoji ? `${emoji} ${title}` : title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  container: { marginBottom: spacing.lg },
  title: { fontSize: font(24), fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font(16), color: colors.muted, marginTop: spacing.xs },
}));
