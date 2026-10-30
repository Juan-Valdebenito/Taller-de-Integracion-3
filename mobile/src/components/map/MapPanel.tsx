import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../../theme';

export interface MapPanelProps {
  title: string;
  /** Resumen de una línea que se ve con el panel plegado. */
  summary: string;
  children: ReactNode;
  /** Abierto al empezar (por defecto plegado, para ver el mapa completo). */
  initiallyOpen?: boolean;
  /** Para controlarlo desde afuera (p. ej. que al abrir un panel se pliegue el otro). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Sin márgenes alrededor del contenido (filas de borde a borde, como una lista). */
  flush?: boolean;
}

/**
 * Panel plegable sobre el mapa (quien lo usa decide dónde va). En pantallas
 * angostas el web oculta su panel lateral y deja el mapa completo; aquí el
 * contenido del panel sigue a mano sin tapar el mapa mientras está plegado.
 */
export function MapPanel({ title, summary, children, initiallyOpen = false, open: controlledOpen, onOpenChange, flush = false }: MapPanelProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [ownOpen, setOwnOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <View style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={open ? 'Pliega el panel' : 'Despliega el panel'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {!open ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <ScrollView style={styles.body} contentContainerStyle={flush ? styles.bodyFlush : styles.bodyContent}>
          {children}
        </ScrollView>
      ) : null}
    </View>
  );
}

// Tarjeta del web (--color-surface-1, borde, radio 12) con la sombra de sus paneles.
const useStyles = makeStyles((colors, font) => ({
  panel: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md },
  headerText: { flex: 1 },
  title: { fontSize: font(14), lineHeight: font(20), fontWeight: '600', color: colors.text },
  summary: { fontSize: font(12), lineHeight: font(18), color: colors.muted, marginTop: 2 },
  body: { flexShrink: 1, borderTopWidth: 1, borderTopColor: colors.border },
  bodyContent: { padding: spacing.md, gap: spacing.md },
  bodyFlush: { paddingVertical: spacing.xs },
}));
