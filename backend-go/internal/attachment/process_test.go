package attachment

import (
	"bytes"
	"errors"
	"image"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Caso completo: foto de celular con EXIF, una patente marcada y el reclamo con
// espacio para más imágenes.
func TestProcessUploadFullFlow(t *testing.T) {
	const sensorW, sensorH = 640, 480
	plateShown := image.Rect(140, 420, 340, 480)
	photo := phonePhoto(t, sensorW, sensorH, 2, 6, sensorRectForDisplayed90(plateShown, sensorH))
	zones := `[{"x":0.291666,"y":0.65625,"width":0.416667,"height":0.09375}]` // la patente, sobre la foto derecha 480×640

	s, err := ProcessUpload(bytes.NewReader(photo), 1, zones)
	if err != nil {
		t.Fatal(err)
	}
	if s.MimeType != domain.MimeTypeJPEG || s.Width != 480 || s.Height != 640 || s.MaskedRegions != 1 {
		t.Fatalf("got %s %dx%d con %d zonas", s.MimeType, s.Width, s.Height, s.MaskedRegions)
	}
	if bytes.Contains(s.Data, exifHeader) {
		t.Error("el resultado no debe conservar el EXIF")
	}
	if d := detail(decodeJPEG(t, s.Data), plateShown); d > hiddenDetail {
		t.Errorf("la patente sigue legible (detalle %.1f)", d)
	}

	// Listo para guardar: nombre interno y registro válidos.
	key, err := NewStorageKey("complaint-1", s.MimeType)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ToAttachment("complaint-1", key, nil).Validate(); err != nil {
		t.Fatalf("el registro debe poder guardarse: %v", err)
	}
}

func TestProcessUploadWithoutZones(t *testing.T) {
	s, err := ProcessUpload(bytes.NewReader(sized(t, domain.MimeTypePNG, 120, 80)), 0, "")
	if err != nil {
		t.Fatal(err)
	}
	if s.MaskedRegions != 0 || s.Width != 120 || s.Height != 80 {
		t.Fatalf("got %dx%d con %d zonas", s.Width, s.Height, s.MaskedRegions)
	}
}

// Zonas mal enviadas o reclamo lleno: se rechaza sin recibir la foto.
func TestProcessUploadRejectsBeforeReadingTheFile(t *testing.T) {
	cases := []struct {
		name    string
		current int
		zones   string
		want    error
	}{
		{"zonas con formato inválido", 0, "no es json", ErrInvalidMaskRegionsFormat},
		{"zona fuera de la imagen", 0, `[{"x":0.9,"y":0,"width":0.5,"height":0.5}]`, ErrInvalidMaskRegion},
		{"texto de zonas demasiado grande", 0, string(make([]byte, MaxMaskRegionsJSONBytes+1)), ErrMaskRegionsTooLarge},
		{"reclamo con el máximo de imágenes", domain.MaxAttachmentsPerComplaint, "", domain.ErrAttachmentLimitReached},
	}
	for _, tc := range cases {
		s, err := ProcessUpload(mustNotRead{t}, tc.current, tc.zones)
		if !errors.Is(err, tc.want) || s != nil {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, err)
		}
		if !IsClientError(err) {
			t.Errorf("%s: %v debe ser error del cliente (4xx)", tc.name, err)
		}
	}
}

// Los errores del archivo (tarea 2) llegan tal cual y son errores del cliente.
func TestProcessUploadRejectsBadFiles(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		want error
	}{
		{"vacío", nil, domain.ErrAttachmentEmpty},
		{"no es imagen", []byte("esto no es una imagen"), domain.ErrAttachmentUnsupportedType},
		{"bomba de descompresión", pngHeaderOnly(20000, 20000), domain.ErrAttachmentDimensions},
		{"PNG cortado", sized(t, domain.MimeTypePNG, 64, 64)[:40], ErrAttachmentCorrupt},
	}
	for _, tc := range cases {
		s, err := ProcessUpload(bytes.NewReader(tc.data), 0, "")
		if !errors.Is(err, tc.want) || s != nil {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, err)
		}
		if !IsClientError(err) {
			t.Errorf("%s: %v debe ser error del cliente (4xx)", tc.name, err)
		}
	}
}
