package attachment

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"hash/crc32"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Datos personales de ejemplo que un celular deja dentro de la foto.
const (
	gpsMetadata    = "GPS -38.7359 -72.5904 Temuco"
	deviceMetadata = "Modelo: TelefonoDePrueba X1"
	hiddenComment  = "comentario escondido en la imagen"
	trailingBytes  = "datos pegados al final del archivo"
)

// jpegWithMetadata arma un JPEG real con un segmento EXIF (APP1) con GPS y
// modelo del teléfono, un comentario (COM) y bytes extra después del final.
func jpegWithMetadata(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, gradient(80, 60, false), &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	clean := buf.Bytes()

	segment := func(marker byte, payload string) []byte {
		s := []byte{0xFF, marker, 0, 0}
		binary.BigEndian.PutUint16(s[2:], uint16(len(payload)+2))
		return append(s, payload...)
	}
	exif := "Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08 " + gpsMetadata + " " + deviceMetadata

	out := append([]byte{}, clean[:2]...) // SOI
	out = append(out, segment(0xE1, exif)...)
	out = append(out, segment(0xFE, hiddenComment)...)
	out = append(out, clean[2:]...)
	return append(out, trailingBytes...)
}

// pngWithMetadata arma un PNG real con fragmentos de texto (tEXt) y EXIF
// (eXIf) antes de los píxeles, y bytes extra después del final.
func pngWithMetadata(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, gradient(80, 60, true)); err != nil {
		t.Fatal(err)
	}
	clean := buf.Bytes()

	chunk := func(kind, payload string) []byte {
		var c bytes.Buffer
		_ = binary.Write(&c, binary.BigEndian, uint32(len(payload)))
		body := append([]byte(kind), payload...)
		c.Write(body)
		_ = binary.Write(&c, binary.BigEndian, crc32.ChecksumIEEE(body))
		return c.Bytes()
	}

	idat := bytes.Index(clean, []byte("IDAT")) - 4 // inicio del fragmento (su largo)
	out := append([]byte{}, clean[:idat]...)
	out = append(out, chunk("tEXt", "Comment\x00"+hiddenComment)...)
	out = append(out, chunk("eXIf", "MM\x00\x2a "+gpsMetadata+" "+deviceMetadata)...)
	out = append(out, clean[idat:]...)
	return append(out, trailingBytes...)
}

func sanitizeUpload(t *testing.T, data []byte) *SanitizedImage {
	t.Helper()
	v, err := ValidateUpload(bytes.NewReader(data), 0)
	if err != nil {
		t.Fatalf("la imagen con metadatos debe pasar la validación: %v", err)
	}
	s, err := Sanitize(v)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSanitizeRemovesMetadataAndHiddenContent(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		mime string
	}{
		{"JPEG con EXIF, GPS, comentario y bytes extra", jpegWithMetadata(t), domain.MimeTypeJPEG},
		{"PNG con tEXt, eXIf y bytes extra", pngWithMetadata(t), domain.MimeTypePNG},
	}
	for _, tc := range cases {
		// La imagen original de verdad trae los datos personales...
		for _, secret := range []string{gpsMetadata, deviceMetadata, hiddenComment, trailingBytes} {
			if !bytes.Contains(tc.data, []byte(secret)) {
				t.Fatalf("%s: el archivo de prueba debería contener %q", tc.name, secret)
			}
		}

		s := sanitizeUpload(t, tc.data)

		// ...y la sanitizada no conserva ninguno.
		for _, secret := range []string{gpsMetadata, deviceMetadata, hiddenComment, trailingBytes, "Exif", "eXIf", "tEXt"} {
			if bytes.Contains(s.Data, []byte(secret)) {
				t.Errorf("%s: la imagen sanitizada todavía contiene %q", tc.name, secret)
			}
		}
		if s.MimeType != tc.mime || s.Width != 80 || s.Height != 60 {
			t.Errorf("%s: got %s %dx%d", tc.name, s.MimeType, s.Width, s.Height)
		}
	}
}

// La imagen sanitizada termina exactamente donde termina la imagen: nada pegado después.
func TestSanitizeLeavesNothingAfterTheImageEnd(t *testing.T) {
	jpg := sanitizeUpload(t, jpegWithMetadata(t))
	if !bytes.HasSuffix(jpg.Data, []byte{0xFF, 0xD9}) {
		t.Error("el JPEG sanitizado debe terminar con el marcador EOI (FF D9)")
	}
	pngImg := sanitizeUpload(t, pngWithMetadata(t))
	iend := []byte{0, 0, 0, 0, 'I', 'E', 'N', 'D', 0xAE, 0x42, 0x60, 0x82}
	if !bytes.HasSuffix(pngImg.Data, iend) {
		t.Error("el PNG sanitizado debe terminar con el fragmento IEND")
	}
}

func TestSanitizeReportsSizeAndHashOfTheCleanFile(t *testing.T) {
	s := sanitizeUpload(t, jpegWithMetadata(t))

	sum := sha256.Sum256(s.Data)
	if s.SHA256 != hex.EncodeToString(sum[:]) {
		t.Errorf("SHA256 debe ser el del archivo sanitizado")
	}
	if s.SizeBytes != int64(len(s.Data)) {
		t.Errorf("SizeBytes = %d, el archivo mide %d", s.SizeBytes, len(s.Data))
	}

	// El resultado cumple las reglas del dominio para guardarse en la base.
	att := domain.ComplaintAttachment{
		ComplaintID: "complaint-1",
		StorageKey:  "complaints/complaint-1/clave.jpg",
		MimeType:    s.MimeType,
		SizeBytes:   s.SizeBytes,
		Width:       s.Width,
		Height:      s.Height,
		SHA256:      s.SHA256,
	}
	if err := att.Validate(); err != nil {
		t.Fatalf("la imagen sanitizada debe poder guardarse: %v", err)
	}
}

// Sanitizar una imagen ya sanitizada da una imagen igual de válida (proceso estable).
func TestSanitizeOutputPassesValidationAgain(t *testing.T) {
	first := sanitizeUpload(t, pngWithMetadata(t))
	second := sanitizeUpload(t, first.Data)
	// PNG es sin pérdida: volver a sanitizar produce exactamente el mismo archivo.
	if second.SHA256 != first.SHA256 {
		t.Error("sanitizar dos veces un PNG debe producir el mismo archivo")
	}
}

func TestSanitizeNil(t *testing.T) {
	if _, err := Sanitize(nil); err == nil || !strings.Contains(err.Error(), "nil") {
		t.Fatalf("want error por imagen nil, got %v", err)
	}
}
