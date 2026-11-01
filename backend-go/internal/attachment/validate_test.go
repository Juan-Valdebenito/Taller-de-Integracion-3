package attachment

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// mustNotRead falla el test si alguien intenta leer el archivo.
type mustNotRead struct{ t *testing.T }

func (m mustNotRead) Read([]byte) (int, error) {
	m.t.Fatal("no se debe leer el archivo si el reclamo ya tiene el máximo de imágenes")
	return 0, nil
}

func TestValidateUploadAcceptsValidImages(t *testing.T) {
	cases := []struct {
		mime          string
		width, height int
	}{
		{domain.MimeTypeJPEG, 1280, 960},
		{domain.MimeTypePNG, 400, 300},
	}
	for _, tc := range cases {
		data := sized(t, tc.mime, tc.width, tc.height)
		img, err := ValidateUpload(bytes.NewReader(data), 0)
		if err != nil {
			t.Fatalf("%s: %v", tc.mime, err)
		}
		sum := sha256.Sum256(data)
		want := ValidatedImage{
			Data: data, MimeType: tc.mime, Width: tc.width, Height: tc.height,
			ReceivedSHA256: hex.EncodeToString(sum[:]),
		}
		if !bytes.Equal(img.Data, want.Data) || img.MimeType != want.MimeType || img.Width != want.Width ||
			img.Height != want.Height || img.ReceivedSHA256 != want.ReceivedSHA256 {
			t.Errorf("%s: got %+v", tc.mime, *img)
		}
	}
}

func TestValidateUploadAllowsUpToTheLimit(t *testing.T) {
	data := sized(t, domain.MimeTypePNG, 2, 2)
	for current := 0; current < domain.MaxAttachmentsPerComplaint; current++ {
		if _, err := ValidateUpload(bytes.NewReader(data), current); err != nil {
			t.Errorf("con %d imágenes debe aceptar otra: %v", current, err)
		}
	}
}

// Con el reclamo lleno se rechaza sin recibir el archivo.
func TestValidateUploadChecksLimitBeforeReading(t *testing.T) {
	_, err := ValidateUpload(mustNotRead{t}, domain.MaxAttachmentsPerComplaint)
	if !errors.Is(err, domain.ErrAttachmentLimitReached) {
		t.Fatalf("want ErrAttachmentLimitReached, got %v", err)
	}
}

func TestValidateUploadRejections(t *testing.T) {
	realPNG := sized(t, domain.MimeTypePNG, 10, 10)
	cases := []struct {
		name string
		data []byte
		want error
	}{
		{"vacío", nil, domain.ErrAttachmentEmpty},
		{"más de 5 MB", make([]byte, domain.MaxAttachmentSizeBytes+1), domain.ErrAttachmentTooLarge},
		{"texto renombrado a foto.jpg", []byte("esto no es una imagen"), domain.ErrAttachmentUnsupportedType},
		{"GIF real", encoded(t, "gif"), domain.ErrAttachmentUnsupportedType},
		{"bomba de descompresión (33 bytes, 400 MP)", pngHeaderOnly(20000, 20000), domain.ErrAttachmentDimensions},
		{"PNG cortado", realPNG[:20], ErrAttachmentCorrupt},
	}
	for _, tc := range cases {
		img, err := ValidateUpload(bytes.NewReader(tc.data), 0)
		if !errors.Is(err, tc.want) || img != nil {
			t.Errorf("%s: want %v, got %v (img=%v)", tc.name, tc.want, err, img != nil)
		}
		if !IsClientError(err) {
			t.Errorf("%s: el error %v debe considerarse culpa del archivo (4xx)", tc.name, err)
		}
	}
}

func TestValidateUploadReadErrorIsClientError(t *testing.T) {
	_, err := ValidateUpload(failing{}, 0)
	if !errors.Is(err, ErrAttachmentRead) || !IsClientError(err) {
		t.Fatalf("una subida cortada es un error del cliente: %v", err)
	}
}

func TestIsClientError(t *testing.T) {
	if IsClientError(nil) {
		t.Error("nil no es un error del cliente")
	}
	if IsClientError(errors.New("disco lleno")) {
		t.Error("un error interno no debe responderse como 4xx")
	}
	// Funciona aunque el error venga envuelto.
	if !IsClientError(fmt.Errorf("subida: %w", domain.ErrAttachmentTooLarge)) {
		t.Error("un error del dominio envuelto sigue siendo del cliente")
	}
}
