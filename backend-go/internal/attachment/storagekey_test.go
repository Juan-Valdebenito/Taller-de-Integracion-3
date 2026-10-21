package attachment

import (
	"bytes"
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

var keyFormat = regexp.MustCompile(`^complaints/([A-Za-z0-9_-]+)/([0-9a-f]{32})\.(jpg|png)$`)

func TestNewStorageKeyFormat(t *testing.T) {
	cases := []struct {
		complaintID, mime, ext string
	}{
		{"7f3c9b2e-1d4a-4c8e-9a51-0b6f2d8e4c17", domain.MimeTypeJPEG, "jpg"}, // UUID
		{"comp-seed-03", domain.MimeTypePNG, "png"},                          // id del seeder
		{"A_b-9", domain.MimeTypeJPEG, "jpg"},
	}
	for _, tc := range cases {
		key, err := NewStorageKey(tc.complaintID, tc.mime)
		if err != nil {
			t.Fatalf("%s: %v", tc.complaintID, err)
		}
		m := keyFormat.FindStringSubmatch(key)
		if m == nil {
			t.Fatalf("formato inesperado: %q", key)
		}
		if m[1] != tc.complaintID || m[3] != tc.ext {
			t.Errorf("%q: reclamo %q y extensión %q, want %q y %q", key, m[1], m[3], tc.complaintID, tc.ext)
		}
	}
}

// Cada nombre es distinto: 128 bits aleatorios.
func TestNewStorageKeyIsUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 10_000; i++ {
		key, err := NewStorageKey("complaint-1", domain.MimeTypeJPEG)
		if err != nil {
			t.Fatal(err)
		}
		if seen[key] {
			t.Fatalf("nombre repetido: %s", key)
		}
		seen[key] = true
	}
}

// Ids que podrían cambiar la ruta o colarse en ella se rechazan.
func TestNewStorageKeyRejectsUnsafeComplaintIDs(t *testing.T) {
	unsafe := []string{
		"",
		"..",
		"../../etc",
		"a/b",
		`a\b`,
		"c1/../../secret",
		"id con espacios",
		"id\x00nulo",
		"reclamo.jpg",
		"ñandú",
		"%2e%2e",
		strings.Repeat("a", maxComplaintIDLength+1),
	}
	for _, id := range unsafe {
		if key, err := NewStorageKey(id, domain.MimeTypeJPEG); !errors.Is(err, ErrInvalidComplaintID) || key != "" {
			t.Errorf("id %q: want ErrInvalidComplaintID, got %q, %v", id, key, err)
		}
	}
	// El largo máximo exacto sí se acepta.
	if _, err := NewStorageKey(strings.Repeat("a", maxComplaintIDLength), domain.MimeTypeJPEG); err != nil {
		t.Errorf("id de %d caracteres debe aceptarse: %v", maxComplaintIDLength, err)
	}
}

func TestNewStorageKeyRejectsUnsupportedType(t *testing.T) {
	if _, err := NewStorageKey("complaint-1", "image/gif"); !errors.Is(err, domain.ErrAttachmentUnsupportedType) {
		t.Fatalf("want ErrAttachmentUnsupportedType, got %v", err)
	}
}

func TestNewStorageKeyUsesTheRandomSource(t *testing.T) {
	original := randomSource
	t.Cleanup(func() { randomSource = original })

	randomSource = bytes.NewReader(bytes.Repeat([]byte{0xAB}, tokenBytes))
	key, err := NewStorageKey("c1", domain.MimeTypePNG)
	if err != nil || key != "complaints/c1/"+strings.Repeat("ab", tokenBytes)+".png" {
		t.Fatalf("got %q, %v", key, err)
	}

	// Si la fuente aleatoria falla, no se inventa un nombre predecible.
	randomSource = bytes.NewReader(nil)
	if key, err := NewStorageKey("c1", domain.MimeTypePNG); err == nil || key != "" {
		t.Fatalf("sin aleatoriedad debe fallar, got %q, %v", key, err)
	}
}

// El nombre generado cumple las reglas del dominio para guardarse en la base.
func TestNewStorageKeyFitsTheAttachmentModel(t *testing.T) {
	key, err := NewStorageKey("complaint-1", domain.MimeTypeJPEG)
	if err != nil {
		t.Fatal(err)
	}
	att := domain.ComplaintAttachment{
		ComplaintID: "complaint-1", StorageKey: key, MimeType: domain.MimeTypeJPEG,
		SizeBytes: 100, Width: 10, Height: 10, SHA256: strings.Repeat("a", 64),
	}
	if err := att.Validate(); err != nil {
		t.Fatal(err)
	}
}
