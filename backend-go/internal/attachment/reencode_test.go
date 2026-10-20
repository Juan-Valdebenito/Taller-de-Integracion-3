package attachment

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// gradient genera una imagen con contenido variado (no un color plano) para que
// los tests de codificación sean realistas.
func gradient(width, height int, alpha bool) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			a := uint8(255)
			if alpha {
				a = uint8(x * 255 / width)
			}
			img.Set(x, y, color.NRGBA{R: uint8(x * 255 / width), G: uint8(y * 255 / height), B: 120, A: a})
		}
	}
	return img
}

func validated(t *testing.T, img image.Image, mimeType string) *ValidatedImage {
	t.Helper()
	var buf bytes.Buffer
	var err error
	if mimeType == domain.MimeTypeJPEG {
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	} else {
		err = png.Encode(&buf, img)
	}
	if err != nil {
		t.Fatal(err)
	}
	v, err := ValidateUpload(bytes.NewReader(buf.Bytes()), 0)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestReencodeKeepsFormatAndDimensions(t *testing.T) {
	for _, mime := range []string{domain.MimeTypeJPEG, domain.MimeTypePNG} {
		v := validated(t, gradient(64, 48, false), mime)

		data, img, err := reencode(v)
		if err != nil {
			t.Fatalf("%s: %v", mime, err)
		}
		// El resultado es una imagen válida del mismo tipo y tamaño.
		gotMime, err := DetectImageType(data)
		if err != nil || gotMime != mime {
			t.Fatalf("%s: el resultado se detecta como %q, %v", mime, gotMime, err)
		}
		w, h, err := ReadDimensions(data, mime)
		if err != nil || w != 64 || h != 48 {
			t.Fatalf("%s: dimensiones %dx%d, %v", mime, w, h, err)
		}
		if b := img.Bounds(); b.Dx() != 64 || b.Dy() != 48 {
			t.Fatalf("%s: la imagen decodificada mide %v", mime, b)
		}
	}
}

// PNG sin pérdida: los píxeles quedan idénticos, incluida la transparencia.
func TestReencodePNGIsLosslessAndKeepsTransparency(t *testing.T) {
	original := gradient(32, 16, true)
	v := validated(t, original, domain.MimeTypePNG)

	data, _, err := reencode(v)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 16; y++ {
		for x := 0; x < 32; x++ {
			want := original.NRGBAAt(x, y)
			got := color.NRGBAModel.Convert(decoded.At(x, y)).(color.NRGBA)
			if got != want {
				t.Fatalf("píxel (%d,%d): got %v, want %v", x, y, got, want)
			}
		}
	}
}

// JPEG con pérdida: la imagen se ve igual (diferencia de color pequeña).
func TestReencodeJPEGLooksTheSame(t *testing.T) {
	original := gradient(64, 64, false)
	v := validated(t, original, domain.MimeTypeJPEG)

	data, _, err := reencode(v)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	var total, n float64
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			r1, g1, b1, _ := original.At(x, y).RGBA()
			r2, g2, b2, _ := decoded.At(x, y).RGBA()
			total += absDiff(r1, r2) + absDiff(g1, g2) + absDiff(b1, b2)
			n += 3
		}
	}
	// Promedio en escala 0-255.
	if avg := total / n / 257; avg > 6 {
		t.Fatalf("la imagen recodificada difiere demasiado del original: %.2f de 255 en promedio", avg)
	}
}

func absDiff(a, b uint32) float64 {
	if a > b {
		return float64(a - b)
	}
	return float64(b - a)
}

// Decodificar todos los píxeles detecta daños que la cabecera sola no muestra.
func TestReencodeDetectsDamageAfterTheHeader(t *testing.T) {
	for _, mime := range []string{domain.MimeTypeJPEG, domain.MimeTypePNG} {
		full := validated(t, gradient(64, 64, false), mime)
		// Se corta el archivo después de la cabecera: las dimensiones se leen bien...
		cut := full.Data[:len(full.Data)*2/3]
		if _, _, err := ReadDimensions(cut, mime); err != nil {
			t.Fatalf("%s: la cabecera del archivo cortado debería leerse: %v", mime, err)
		}
		// ...pero los píxeles están incompletos.
		_, _, err := reencode(&ValidatedImage{Data: cut, MimeType: mime, Width: 64, Height: 64})
		if !errors.Is(err, ErrAttachmentCorrupt) {
			t.Errorf("%s cortado: want ErrAttachmentCorrupt, got %v", mime, err)
		}
	}
}

func TestReencodeRejectsUnsupportedType(t *testing.T) {
	_, _, err := reencode(&ValidatedImage{Data: []byte("x"), MimeType: "image/gif"})
	if !errors.Is(err, domain.ErrAttachmentUnsupportedType) {
		t.Fatalf("want ErrAttachmentUnsupportedType, got %v", err)
	}
}
