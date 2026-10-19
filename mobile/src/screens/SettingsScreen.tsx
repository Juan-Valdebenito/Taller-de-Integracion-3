import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { SegmentedControl, type SegmentedOption } from '../components/SegmentedControl';
import { SettingSwitchRow } from '../components/SettingSwitchRow';
import { useNotificationPreference } from '../hooks/useNotificationPreference';
import { useSettings } from '../settings/SettingsContext';
import type { TextSizePreference, ThemePreference } from '../settings/settingsStorage';
import { makeStyles, radius, spacing } from '../theme';

export const THEME_OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export const TEXT_SIZE_OPTIONS: readonly SegmentedOption<TextSizePreference>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'extraLarge', label: 'Muy grande' },
];

/** Configuración del pasajero: notificaciones y preferencias de interfaz. */
export function SettingsScreen() {
  const styles = useStyles();
  const { settings, saveError, updateSettings, resetSettings } = useSettings();
  const notifications = useNotificationPreference();
  const notificationNotice = notifications.revoked
    ? 'Quitaste el permiso de notificaciones en los ajustes del teléfono. Actívalo de nuevo para recibir alertas.'
    : notifications.message;
  const showOpenSettings = notifications.revoked || notifications.permission === 'blocked';

  const confirmReset = useCallback(() => {
    Alert.alert('Restablecer configuración', '¿Volver a los valores por defecto? Las notificaciones quedarán desactivadas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restablecer', style: 'destructive', onPress: resetSettings },
    ]);
  }, [resetSettings]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {saveError ? (
          <View style={styles.error}>
            <Text style={styles.errorText} accessibilityRole="alert">
              {saveError}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Notificaciones
        </Text>
        <View style={styles.card}>
          <SettingSwitchRow
            label="Notificaciones push"
            description="Recibe en el teléfono las alertas de micros que se acercan a tu paradero."
            value={notifications.enabled}
            onValueChange={notifications.setEnabled}
            disabled={notifications.busy}
          />
          {notificationNotice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText} accessibilityRole="alert">
                {notificationNotice}
              </Text>
              {showOpenSettings ? (
                <View style={styles.noticeAction}>
                  <Button title="Abrir ajustes" variant="secondary" onPress={notifications.openSettings} />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.divider} />
          <SettingSwitchRow
            label="Vibración"
            description="Vibrar al recibir una alerta de proximidad."
            value={settings.vibrationEnabled}
            onValueChange={(vibrationEnabled) => updateSettings({ vibrationEnabled })}
          />
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Interfaz
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>Tema</Text>
          <Text style={styles.description}>"Sistema" usa el modo claro u oscuro configurado en tu teléfono.</Text>
          <SegmentedControl
            label="Tema"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
          <View style={styles.divider} />
          <Text style={styles.label}>Tamaño del texto</Text>
          <SegmentedControl
            label="Tamaño del texto"
            options={TEXT_SIZE_OPTIONS}
            value={settings.textSize}
            onChange={(textSize) => updateSettings({ textSize })}
          />
          <Text style={styles.preview} accessibilityLabel="Vista previa del tamaño del texto">
            Así se verá el texto en la app: la micro ABCD12 está a 350 m de tu paradero.
          </Text>
        </View>

        <View style={styles.reset}>
          <Button title="Restablecer valores por defecto" variant="secondary" onPress={confirmReset} />
        </View>
        <Text style={styles.hint}>La configuración se guarda en este teléfono y se mantiene al cerrar sesión.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  error: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: font(14) },
  sectionTitle: {
    fontSize: font(13),
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  notice: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs },
  noticeText: { fontSize: font(13), lineHeight: font(18), color: colors.text },
  noticeAction: { alignItems: 'flex-start' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  label: { fontSize: font(16), fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  description: { marginTop: 2, fontSize: font(13), color: colors.muted, lineHeight: font(18) },
  preview: {
    marginTop: spacing.sm,
    fontSize: font(16),
    lineHeight: font(22),
    color: colors.text,
  },
  reset: { marginTop: spacing.sm, alignItems: 'center' },
  hint: { marginTop: spacing.sm, fontSize: font(13), color: colors.muted, textAlign: 'center' },
}));
