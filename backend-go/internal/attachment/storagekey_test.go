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

func TestParseStorageKeyAcceptsGeneratedKeys(t *testing.T) {
	for _, tc := range []struct{ complaintID, mime string }{
		{"7f3c9b2e-1d4a-4c8e-9a51-0b6f2d8e4c17", domain.MimeTypeJPEG},
		{"comp-seed-03", domain.MimeTypePNG},
	} {
		for i := 0; i < 100; i++ {
			key, err := NewStorageKey(tc.complaintID, tc.mime)
			if err != nil {
				t.Fatal(err)
			}
			info, err := ParseStorageKey(key)
			if err != nil {
				t.Fatalf("%q generado por NewStorageKey debe ser válido: %v", key, err)
			}
			if info.ComplaintID != tc.complaintID || info.MimeType != tc.mime {
				t.Fatalf("%q: got %+v", key, info)
			}
		}
	}
}

// Nombres manipulados para salir de la carpeta de imágenes, o simplemente mal
// formados: todos se rechazan.
func TestParseStorageKeyRejectsTamperedKeys(t *testing.T) {
	token := strings.Repeat("ab", tokenBytes)
	bad := []string{
		"",
		"complaints/",
		"complaints/c1/",
		"complaints/c1/" + token,                                     // sin extensión
		"complaints/../" + token + ".jpg",                            // reclamo ".."
		"complaints/c1/../../etc/passwd",                             // salir de la carpeta
		"complaints/c1/../c2/" + token + ".jpg",                      // saltar a otro reclamo
		"complaints/c1/sub/" + token + ".jpg",                        // subcarpetas extra
		"complaints//" + token + ".jpg",                              // reclamo vacío
		"/complaints/c1/" + token + ".jpg",                           // ruta absoluta
		`C:\complaints\c1\` + token + ".jpg",                         // ruta de Windows
		`complaints\c1\` + token + ".jpg",                            // barras invertidas
		"COMPLAINTS/c1/" + token + ".jpg",                            // prefijo distinto
		"other/c1/" + token + ".jpg",                                 // otra carpeta
		"complaints/c1/" + strings.ToUpper(token) + ".jpg",           // hexadecimal en mayúsculas
		"complaints/c1/" + token[:31] + ".jpg",                       // token corto
		"complaints/c1/" + token + "a.jpg",                           // token largo
		"complaints/c1/" + strings.Repeat("zz", tokenBytes) + ".jpg", // no hexadecimal
		"complaints/c1/" + token + ".jpeg",                           // extensión no generada
		"complaints/c1/" + token + ".gif",                            // tipo no permitido
		"complaints/c1/" + token + ".jpg.php",                        // doble extensión
		"complaints/c1/" + token + ".JPG",                            // mayúsculas
		"complaints/c1/" + token + ".jpg\n",                          // salto de línea
		"complaints/c1/" + token + ".jpg\x00",                        // byte nulo
		"complaints/c1%2F..%2F/" + token + ".jpg",                    // codificado para URL
		" complaints/c1/" + token + ".jpg",                           // espacio inicial
	}
	for _, key := range bad {
		if info, err := ParseStorageKey(key); !errors.Is(err, ErrInvalidStorageKey) || info != (StorageKeyInfo{}) {
			t.Errorf("%q: want ErrInvalidStorageKey, got %+v, %v", key, info, err)
		}
	}
}

func TestValidateStorageKeyFor(t *testing.T) {
	key, err := NewStorageKey("complaint-1", domain.MimeTypeJPEG)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateStorageKeyFor(key, "complaint-1"); err != nil {
		t.Fatalf("el nombre de su propio reclamo debe ser válido: %v", err)
	}
	// Una imagen no puede apuntar al archivo de otro reclamo.
	if err := ValidateStorageKeyFor(key, "complaint-2"); !errors.Is(err, ErrInvalidStorageKey) {
		t.Fatalf("otro reclamo: want ErrInvalidStorageKey, got %v", err)
	}
	if err := ValidateStorageKeyFor("complaints/complaint-1/../x", "complaint-1"); !errors.Is(err, ErrInvalidStorageKey) {
		t.Fatalf("nombre manipulado: want ErrInvalidStorageKey, got %v", err)
	}
}

// Las extensiones que se generan y las que se aceptan al leer son las mismas.
func TestStorageKeyExtensionsMatchTheDomain(t *testing.T) {
	for ext, mime := range mimeTypeForExtension {
		got, err := domain.AttachmentExtension(mime)
		if err != nil || got != ext {
			t.Errorf("%s: el dominio genera %q (%v), aquí se acepta %q", mime, got, err, ext)
		}
	}
	for _, mime := range []string{domain.MimeTypeJPEG, domain.MimeTypePNG} {
		ext, _ := domain.AttachmentExtension(mime)
		if mimeTypeForExtension[ext] != mime {
			t.Errorf("la extensión %q de %s no se acepta al leer", ext, mime)
		}
	}
}
