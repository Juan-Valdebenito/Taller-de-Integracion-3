package attachment

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// encoded genera una imagen real de 4×3 en el formato pedido.
func encoded(t *testing.T, format string) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 3))
	img.Set(1, 1, color.RGBA{R: 200, A: 255})
	var buf bytes.Buffer
	var err error
	switch format {
	case "jpeg":
		err = jpeg.Encode(&buf, img, nil)
	case "png":
		err = png.Encode(&buf, img)
	case "gif":
		err = gif.Encode(&buf, img, nil)
	default:
		t.Fatalf("formato desconocido %q", format)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestDetectImageTypeAcceptsRealImages(t *testing.T) {
	cases := []struct {
		format, want string
	}{
		{"jpeg", domain.MimeTypeJPEG},
		{"png", domain.MimeTypePNG},
	}
	for _, tc := range cases {
		got, err := DetectImageType(encoded(t, tc.format))
		if err != nil || got != tc.want {
			t.Errorf("%s: got %q, %v; want %q", tc.format, got, err, tc.want)
		}
		if !domain.IsAllowedAttachmentType(got) {
			t.Errorf("%s: el tipo detectado %q debe estar permitido por el dominio", tc.format, got)
		}
	}
}

// Contenidos que no son JPEG ni PNG. Son inofensivos a propósito: lo que se prueba
// es que no empiezan con una firma de imagen permitida, no lo que harían al abrirse.
func TestDetectImageTypeRejectsEverythingElse(t *testing.T) {
	cases := []struct {
		name string
		data []byte
	}{
		{"GIF real", encoded(t, "gif")},
		{"WebP", append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 16)...)},
		{"SVG (texto XML)", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="3"/></svg>`)},
		{"HTML", []byte("<!DOCTYPE html><html><body>hola</body></html>")},
		{"PDF", []byte("%PDF-1.7\n")},
		{"BMP", []byte("BM\x36\x00\x00\x00\x00\x00")},
		{"texto plano renombrado a foto.jpg", []byte("esto no es una imagen")},
		{"vacío", nil},
		{"solo el inicio de JPEG (2 de 3 bytes)", []byte{0xFF, 0xD8}},
		{"firma PNG incompleta", []byte{0x89, 'P', 'N', 'G'}},
		{"firma PNG con un byte alterado", []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, 'X'}},
		{"firma JPEG desplazada (no al inicio)", append([]byte("xx"), encoded(t, "jpeg")...)},
	}
	for _, tc := range cases {
		got, err := DetectImageType(tc.data)
		if !errors.Is(err, domain.ErrAttachmentUnsupportedType) || got != "" {
			t.Errorf("%s: want ErrAttachmentUnsupportedType, got %q, %v", tc.name, got, err)
		}
	}
}

// El tipo depende solo del contenido: una imagen PNG se detecta como PNG aunque
// el cliente la haya llamado "foto.jpg" o declarado "image/jpeg" (la función ni
// siquiera recibe esos datos).
func TestDetectImageTypeUsesOnlyTheContent(t *testing.T) {
	got, err := DetectImageType(encoded(t, "png"))
	if err != nil || got != domain.MimeTypePNG {
		t.Fatalf("got %q, %v; want %q", got, err, domain.MimeTypePNG)
	}
}
