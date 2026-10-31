import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles, spacing } from '../theme';
import { PageTitle } from './PageTitle';

export interface ComingSoonScreenProps {
  emoji: string;
  title: string;
  /** Qué tendrá la pantalla, como las páginas "🚧" del web. */
  description: string;
}

/** Pantalla provisional de una sección que todavía no está lista (igual a las del web). */
export function ComingSoonScreen({ emoji, title, description }: ComingSoonScreenProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageTitle emoji={emoji} title={title} />
        <Text style={styles.description}>🚧 {description}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  description: { fontSize: font(16), lineHeight: font(26), color: colors.muted },
}));
