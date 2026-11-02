package domain

import (
	"errors"
	"io/fs"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/migrations"
)

func TestAllowedAttachmentTypes(t *testing.T) {
	cases := []struct {
		mime    string
		allowed bool
		ext     string
	}{
		{MimeTypeJPEG, true, ".jpg"},
		{MimeTypePNG, true, ".png"},
		{"image/gif", false, ""},
		{"image/svg+xml", false, ""}, // SVG puede contener JavaScript
		{"image/webp", false, ""},
		{"application/pdf", false, ""},
		{"IMAGE/JPEG", false, ""}, // el tipo se detecta por contenido, siempre en minúscula
		{"", false, ""},
	}
	for _, tc := range cases {
		if got := IsAllowedAttachmentType(tc.mime); got != tc.allowed {
			t.Errorf("IsAllowedAttachmentType(%q) = %v, want %v", tc.mime, got, tc.allowed)
		}
		ext, err := AttachmentExtension(tc.mime)
		if tc.allowed && (err != nil || ext != tc.ext) {
			t.Errorf("AttachmentExtension(%q) = %q, %v; want %q", tc.mime, ext, err, tc.ext)
		}
		if !tc.allowed && !errors.Is(err, ErrAttachmentUnsupportedType) {
			t.Errorf("AttachmentExtension(%q): want ErrAttachmentUnsupportedType, got %v", tc.mime, err)
		}
	}
}

func TestValidateAttachmentSize(t *testing.T) {
	cases := []struct {
		size int64
		want error
	}{
		{-1, ErrAttachmentEmpty},
		{0, ErrAttachmentEmpty},
		{1, nil},
		{MaxAttachmentSizeBytes, nil},
		{MaxAttachmentSizeBytes + 1, ErrAttachmentTooLarge},
	}
	for _, tc := range cases {
		if err := ValidateAttachmentSize(tc.size); !errors.Is(err, tc.want) {
			t.Errorf("ValidateAttachmentSize(%d) = %v, want %v", tc.size, err, tc.want)
		}
	}
	if MaxAttachmentSizeBytes != 5*1024*1024 {
		t.Errorf("el máximo debe ser 5 MB, es %d bytes", MaxAttachmentSizeBytes)
	}
}

func TestValidateAttachmentDimensions(t *testing.T) {
	cases := []struct {
		name          string
		width, height int
		ok            bool
	}{
		{"foto típica de celular 4000×3000 (12 MP)", 4000, 3000, true},
		{"mínimo 1×1", 1, 1, true},
		{"justo en el límite de megapíxeles 6000×4000", 6000, 4000, true},
		{"ancho cero", 0, 100, false},
		{"alto negativo", 100, -1, false},
		{"lado mayor al máximo", MaxAttachmentDimension + 1, 10, false},
		{"bomba de descompresión: 8000×8000 = 64 MP", 8000, 8000, false},
		{"valores enormes no desbordan el producto", 1 << 30, 1 << 30, false},
	}
	for _, tc := range cases {
		err := ValidateAttachmentDimensions(tc.width, tc.height)
		if tc.ok && err != nil {
			t.Errorf("%s: unexpected error %v", tc.name, err)
		}
		if !tc.ok && !errors.Is(err, ErrAttachmentDimensions) {
			t.Errorf("%s: want ErrAttachmentDimensions, got %v", tc.name, err)
		}
	}
}

func TestCanAddAttachment(t *testing.T) {
	for current := 0; current < MaxAttachmentsPerComplaint; current++ {
		if err := CanAddAttachment(current); err != nil {
			t.Errorf("con %d imágenes debe permitir otra, got %v", current, err)
		}
	}
	for _, current := range []int{MaxAttachmentsPerComplaint, MaxAttachmentsPerComplaint + 5} {
		if err := CanAddAttachment(current); !errors.Is(err, ErrAttachmentLimitReached) {
			t.Errorf("con %d imágenes: want ErrAttachmentLimitReached, got %v", current, err)
		}
	}
}

func TestComplaintAttachmentValidate(t *testing.T) {
	if err := sampleAttachment().Validate(); err != nil {
		t.Fatalf("un adjunto válido no debe dar error: %v", err)
	}

	cases := []struct {
		name   string
		mutate func(*ComplaintAttachment)
		want   error
	}{
		{"sin reclamo", func(a *ComplaintAttachment) { a.ComplaintID = " " }, ErrAttachmentInvalid},
		{"sin nombre interno", func(a *ComplaintAttachment) { a.StorageKey = "" }, ErrAttachmentInvalid},
		{"zonas pixeladas negativas", func(a *ComplaintAttachment) { a.MaskedRegions = -1 }, ErrAttachmentInvalid},
		{"tipo no permitido", func(a *ComplaintAttachment) { a.MimeType = "image/gif" }, ErrAttachmentUnsupportedType},
		{"vacía", func(a *ComplaintAttachment) { a.SizeBytes = 0 }, ErrAttachmentEmpty},
		{"muy grande", func(a *ComplaintAttachment) { a.SizeBytes = MaxAttachmentSizeBytes + 1 }, ErrAttachmentTooLarge},
		{"dimensiones inválidas", func(a *ComplaintAttachment) { a.Width = 0 }, ErrAttachmentDimensions},
		{"hash corto", func(a *ComplaintAttachment) { a.SHA256 = "abc" }, ErrAttachmentInvalidHash},
		{"hash en mayúsculas", func(a *ComplaintAttachment) { a.SHA256 = strings.Repeat("AB", 32) }, ErrAttachmentInvalidHash},
		{"hash no hexadecimal", func(a *ComplaintAttachment) { a.SHA256 = strings.Repeat("zz", 32) }, ErrAttachmentInvalidHash},
	}
	for _, tc := range cases {
		att := sampleAttachment()
		tc.mutate(&att)
		if err := att.Validate(); !errors.Is(err, tc.want) {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, err)
		}
	}
}

func TestAttachmentErrorsAreUserFriendly(t *testing.T) {
	if got := ErrAttachmentTooLarge.Error(); got != "la imagen supera el tamaño máximo de 5 MB" {
		t.Errorf("mensaje inesperado: %q", got)
	}
	if got := ErrAttachmentLimitReached.Error(); got != "el reclamo ya tiene el máximo de 3 imágenes" {
		t.Errorf("mensaje inesperado: %q", got)
	}
}

// Las reglas del dominio deben ser iguales o más estrictas que la base de datos,
// para que nunca se intente guardar algo que la base rechace.
func TestAttachmentRulesAreStricterThanDatabase(t *testing.T) {
	up, err := fs.ReadFile(migrations.Filesystem(), "000002_complaint_attachments.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(up)
	for mime := range allowedAttachmentTypes {
		if !strings.Contains(sql, "'"+mime+"'") {
			t.Errorf("el tipo %s se permite en el dominio pero no en la base de datos", mime)
		}
	}
	const dbMaxSize = 10485760 // CHECK ("sizeBytes" <= 10485760)
	if !strings.Contains(sql, "10485760") || MaxAttachmentSizeBytes > dbMaxSize {
		t.Errorf("MaxAttachmentSizeBytes (%d) debe ser <= al tope de la base de datos (%d)", MaxAttachmentSizeBytes, dbMaxSize)
	}
}
