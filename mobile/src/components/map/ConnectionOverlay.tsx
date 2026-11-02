import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Text, View } from 'react-native';

import type { ConnectionStatus } from '../../realtime/types';
import { makeStyles } from '../../theme';

/**
 * Aviso sobre el mapa cuando se pierde la conexión, como ConnectionOverlay del
 * web: solo aparece si ya estuvo conectado (no durante la primera conexión) y
 * desaparece al reconectar.
 */
export function ConnectionOverlay({ status }: { status: ConnectionStatus }) {
  const styles = useStyles();
  const [wasConnected, setWasConnected] = useState(false);
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'connected') setWasConnected(true);
  }, [status]);

  const visible = wasConnected && status !== 'connected';
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1500, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, bar]);

  if (!visible) return null;
  return (
    <View style={styles.backdrop} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <LinearGradient colors={['rgba(30, 27, 75, 0.9)', 'rgba(15, 23, 42, 0.95)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.card}>
        <ActivityIndicator size="large" color="#ef4444" style={styles.spinner} />
        <Text style={styles.title}>🔌 Conexión perdida</Text>
        <Text style={styles.message}>Se perdió la conexión con el servidor. Reconectando automáticamente...</Text>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.pulse,
              { transform: [{ translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-100, 250] }) }] },
            ]}
          >
            <LinearGradient colors={['#ef4444', '#f97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pulseFill} />
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
}

// Medidas y colores del web (fondo rgba(10,14,26,0.7), tarjeta con degradado).
const useStyles = makeStyles((_colors, font) => ({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(10, 14, 26, 0.7)',
  },
  card: {
    maxWidth: 320,
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
  },
  spinner: { marginBottom: 16 },
  title: { fontSize: font(15), fontWeight: '700', color: '#e2e8f0', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: font(12), lineHeight: font(18), color: '#94a3b8', textAlign: 'center' },
  track: { alignSelf: 'stretch', marginTop: 16, height: 3, borderRadius: 2, backgroundColor: 'rgba(99, 102, 241, 0.15)', overflow: 'hidden' },
  pulse: { width: '40%', height: '100%' },
  pulseFill: { flex: 1, borderRadius: 2 },
}));
