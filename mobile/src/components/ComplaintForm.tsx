import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/errors';
import {
  CATEGORY_OPTIONS,
  COMPLAINT_LINES,
  createComplaint,
  fetchComplaintOptions,
  uploadComplaintPhoto,
  type BusOption,
  type Complaint,
  type ComplaintCategory,
  type ComplaintLine,
  type RouteOption,
} from '../api/complaintsApi';
import { MAX_PHOTOS, pickPhotos, takePhoto, type ComplaintPhoto } from '../complaints/photos';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

export interface ComplaintFormValues {
  title: string;
  description: string;
  category: ComplaintCategory | '';
  /** Línea y calificación: el web no las pide, pero backend-go no acepta el reclamo sin ellas. */
  lineName: ComplaintLine | '';
  /** 0 = sin calificar. */
  rating: number;
  busId: string;
  routeId: string;
}

export const EMPTY_FORM: ComplaintFormValues = { title: '', description: '', category: '', lineName: '', rating: 0, busId: '', routeId: '' };

const LINE_OPTIONS = [{ value: '' as const, label: 'Seleccionar línea' }, ...COMPLAINT_LINES.map((line) => ({ value: line, label: `Línea ${line}` }))];
const RATING_LABELS = ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Muy bueno'];

/** Mismas validaciones y mensajes que el formulario del web (más línea y calificación); null si está todo bien. */
export function validateComplaint(form: ComplaintFormValues): string | null {
  if (!form.title.trim() || !form.description.trim() || !form.category || !form.lineName || form.rating < 1) {
    return 'Complete todos los campos obligatorios';
  }
  // El backend deriva la empresa responsable a partir del bus o la ruta.
  if (!form.busId && !form.routeId) {
    return 'Selecciona un bus o una ruta para identificar la empresa responsable';
  }
  return null;
}

/** Resultado al enviar: el reclamo creado y, si alguna foto no se pudo subir, el aviso. */
export interface ComplaintCreated {
  complaint: Complaint;
  photoWarning: string | null;
}

/** Aviso cuando el reclamo se creó pero alguna foto falló (el reclamo no se pierde). */
export function photoWarningFor(failed: number, total: number, reason: string): string {
  const which = failed === total ? (total === 1 ? 'la foto' : 'las fotos') : `${failed} de ${total} fotos`;
  return `El reclamo se creó, pero no se pudo subir ${which}: ${reason}`;
}

export interface ComplaintFormProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (result: ComplaintCreated) => void;
}

/**
 * "Nuevo reclamo", el formulario del web en una pantalla completa: título,
 * categoría, bus y ruta (al menos uno), descripción y hasta 3 fotos. Suma
 * línea y calificación, que backend-go exige. Al enviar crea el reclamo y
 * luego sube las fotos una por una.
 */
export function ComplaintForm({ visible, onClose, onCreated }: ComplaintFormProps) {
  const styles = useStyles();
  const [form, setForm] = useState<ComplaintFormValues>(EMPTY_FORM);
  const [photos, setPhotos] = useState<ComplaintPhoto[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);

  // Rutas y buses se cargan al abrir el formulario (el web los carga una vez al entrar).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    fetchComplaintOptions()
      .then((options) => {
        if (!active) return;
        setRoutes(options.routes);
        setBuses(options.buses);
      })
      .catch(() => {
        // Como el web: sin opciones el formulario sigue, pero no se podrá elegir bus ni ruta.
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const set = <K extends keyof ComplaintFormValues>(key: K) => (value: ComplaintFormValues[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setForm(EMPTY_FORM);
    setPhotos([]);
    setError(null);
  };

  const cancel = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const addPhotos = async (source: 'camera' | 'library') => {
    setAddingPhoto(true);
    setError(null);
    try {
      const added = source === 'camera' ? [await takePhoto()].filter((p): p is ComplaintPhoto => p !== null) : await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e instanceof Error && e.name === 'PhotoPermissionError' ? e.message : 'No se pudo cargar la foto. Intenta con otra.');
    } finally {
      setAddingPhoto(false);
    }
  };

  const submit = async () => {
    const invalid = validateComplaint(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    let complaint: Complaint;
    try {
      complaint = await createComplaint({
        ...form,
        category: form.category as ComplaintCategory,
        lineName: form.lineName as ComplaintLine,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se puede crear el reclamo');
      setSubmitting(false);
      return;
    }

    let failed = 0;
    let reason = '';
    for (const photo of photos) {
      try {
        await uploadComplaintPhoto(complaint.id, photo);
      } catch (e) {
        failed += 1;
        reason ||= e instanceof ApiError ? e.message : 'error desconocido';
      }
    }
    setSubmitting(false);
    reset();
    onCreated({ complaint, photoWarning: failed > 0 ? photoWarningFor(failed, photos.length, reason) : null });
  };

  const busOptions = [{ value: '', label: 'Sin especificar' }, ...buses.map((bus) => ({ value: bus.id, label: bus.patente }))];
  const routeOptions = [
    { value: '', label: 'Sin especificar' },
    ...routes.map((route) => ({ value: route.id, label: `${route.code} - ${route.name}` })),
  ];
  const canAddPhoto = photos.length < MAX_PHOTOS && !submitting && !addingPhoto;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">Nuevo reclamo</Text>

            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TextField label="Título:" value={form.title} onChangeText={set('title')} placeholder="Título del reclamo" editable={!submitting} maxLength={200} />
            <SelectField
              label="Categoría:"
              value={form.category}
              options={[{ value: '' as const, label: 'Seleccionar categoría' }, ...CATEGORY_OPTIONS]}
              onChange={set('category')}
            />
            <SelectField label="Línea:" value={form.lineName} options={LINE_OPTIONS} onChange={set('lineName')} />
            <Text style={styles.sectionLabel}>Calificación del servicio:</Text>
            <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Calificación del servicio">
              {RATING_LABELS.map((label, index) => {
                const value = index + 1;
                const checked = form.rating === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => set('rating')(value)}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`${value} de 5: ${label}`}
                    hitSlop={4}
                  >
                    <Text style={[styles.star, value <= form.rating && styles.starOn]}>★</Text>
                  </Pressable>
                );
              })}
              {form.rating > 0 ? <Text style={styles.ratingLabel}>{RATING_LABELS[form.rating - 1]}</Text> : null}
            </View>
            <SelectField label="Bus (opcional):" value={form.busId} options={busOptions} onChange={set('busId')} />
            <SelectField label="Ruta (opcional):" value={form.routeId} options={routeOptions} onChange={set('routeId')} />
            <Text style={styles.hint}>
              Selecciona al menos un bus o una ruta: así identificamos a la empresa responsable del reclamo.
            </Text>
            <TextField
              label="Descripción"
              value={form.description}
              onChangeText={set('description')}
              placeholder="Describa su reclamo"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={styles.description}
              editable={!submitting}
            />

            <Text style={styles.sectionLabel}>Fotos (opcional)</Text>
            <Text style={styles.hint}>
              Hasta {MAX_PHOTOS} fotos. Se envían junto al reclamo, sin la ubicación ni otros datos de la cámara.
            </Text>
            {photos.length > 0 ? (
              <View style={styles.photos}>
                {photos.map((photo, index) => (
                  <View key={photo.uri} style={styles.photo}>
                    <Image source={{ uri: photo.uri }} style={styles.photoImage} accessibilityLabel={`Foto ${index + 1}`} />
                    <Pressable
                      onPress={() => setPhotos((current) => current.filter((p) => p.uri !== photo.uri))}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar foto ${index + 1}`}
                      hitSlop={6}
                      style={styles.removePhoto}
                    >
                      <Text style={styles.removePhotoText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.photoActions}>
              <View style={styles.flex}>
                <Button title="📷 Tomar foto" variant="secondary" onPress={() => addPhotos('camera')} disabled={!canAddPhoto} />
              </View>
              <View style={styles.flex}>
                <Button title="🖼️ Elegir de la galería" variant="secondary" onPress={() => addPhotos('library')} disabled={!canAddPhoto} />
              </View>
            </View>
            {photos.length >= MAX_PHOTOS ? <Text style={styles.hint}>Ya agregaste el máximo de {MAX_PHOTOS} fotos.</Text> : null}

            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button title="Enviar reclamo" loadingTitle="Enviando..." loading={submitting} onPress={submit} />
              </View>
              <View style={styles.flex}>
                <Button title="Cancelar" variant="secondary" onPress={cancel} disabled={submitting} />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg },
  title: { fontSize: font(20), fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  errorText: { fontSize: font(14), lineHeight: font(20), color: colors.danger },
  hint: { fontSize: font(14), lineHeight: font(20), color: colors.muted, marginBottom: spacing.md },
  description: { minHeight: 120 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 14 },
  star: { fontSize: 30, lineHeight: 36, color: colors.border },
  starOn: { color: '#f59e0b' },
  ratingLabel: { marginLeft: spacing.sm, fontSize: font(14), color: colors.muted },
  sectionLabel: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  photos: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  photo: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  photoImage: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  removePhotoText: { color: '#ffffff', fontSize: font(12), fontWeight: '700' },
  photoActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
}));
