import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';

import { useComplaintPhotos, type LoadedPhoto } from '../hooks/useComplaintPhotos';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';

/**
 * Fotos adjuntas de un reclamo: miniaturas que se abren en grande. El backend
 * ya pixeló rostros y patentes antes de guardarlas.
 */
export function ComplaintPhotos({ complaintId }: { complaintId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { photos, loading, error, reload } = useComplaintPhotos(complaintId);
  const [open, setOpen] = useState<LoadedPhoto | null>(null);
  const masked = photos.reduce((sum, photo) => sum + photo.maskedRegions, 0);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Fotos adjuntas</Text>
      {loading ? (
        <Text style={styles.muted}>Cargando fotos...</Text>
      ) : error ? (
        <View style={styles.inline} accessibilityRole="alert">
          <Text style={[styles.muted, { color: colors.danger, flex: 1 }]}>{error}</Text>
          <Pressable onPress={() => void reload()} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : photos.length === 0 ? (
        <Text style={styles.muted}>Este reclamo no tiene fotos.</Text>
      ) : (
        <>
          <View style={styles.thumbs}>
            {photos.map((photo, index) =>
              photo.uri ? (
                <Pressable
                  key={photo.id}
                  onPress={() => setOpen(photo)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver foto ${index + 1} de ${photos.length}`}
                >
                  <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                </Pressable>
              ) : (
                <View key={photo.id} style={[styles.thumb, styles.broken]} accessible accessibilityLabel={`La foto ${index + 1} no se pudo cargar`}>
                  <Text style={styles.brokenText}>No se pudo cargar</Text>
                </View>
              ),
            )}
          </View>
          {masked > 0 ? <Text style={styles.note}>🔒 {countLabel(masked, 'zona pixelada', 'zonas pixeladas')} (rostros o patentes) para proteger la privacidad.</Text> : null}
        </>
      )}

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Cerrar foto">
          {open?.uri ? <Image source={{ uri: open.uri }} style={styles.full} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
          <Text style={styles.closeHint}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  box: { padding: 12, borderRadius: radius.md, backgroundColor: colors.field },
  title: { marginBottom: spacing.sm, color: colors.muted, fontSize: font(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  muted: { color: colors.placeholder, fontSize: font(13) },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { color: colors.accent, fontSize: font(13), fontWeight: '700' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.background },
  broken: { alignItems: 'center', justifyContent: 'center', padding: spacing.xs, borderWidth: 1, borderColor: colors.border },
  brokenText: { color: colors.placeholder, fontSize: font(11), textAlign: 'center' },
  note: { marginTop: spacing.sm, color: colors.placeholder, fontSize: font(11), lineHeight: font(16) },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0, 0, 0, 0.92)' },
  full: { width: '100%', height: '85%' },
  closeHint: { marginTop: spacing.md, color: '#cbd5e1', fontSize: font(13) },
}));
