package attachment

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// sized genera una imagen real del tamaño pedido en el formato indicado.
func sized(t *testing.T, mimeType string, width, height int) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, width, height))
	var buf bytes.Buffer
	var err error
	if mimeType == domain.MimeTypeJPEG {
		err = jpeg.Encode(&buf, img, nil)
	} else {
		err = png.Encode(&buf, img)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// pngHeaderOnly arma un PNG que solo tiene la firma y la cabecera IHDR (con su
// CRC correcto) declarando las dimensiones pedidas: pocos bytes, sin píxeles.
// Es la forma de una "bomba" de descompresión.
func pngHeaderOnly(width, height uint32) []byte {
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:4], width)
	binary.BigEndian.PutUint32(ihdr[4:8], height)
	ihdr[8] = 8 // profundidad de bits
	ihdr[9] = 2 // color RGB
	// compresión, filtro y entrelazado = 0

	var buf bytes.Buffer
	buf.Write(pngSignature)
	_ = binary.Write(&buf, binary.BigEndian, uint32(len(ihdr)))
	chunk := append([]byte("IHDR"), ihdr...)
	buf.Write(chunk)
	_ = binary.Write(&buf, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	return buf.Bytes()
}

func TestReadDimensionsOfRealImages(t *testing.T) {
	cases := []struct {
		mime          string
		width, height int
	}{
		{domain.MimeTypeJPEG, 640, 480},
		{domain.MimeTypePNG, 300, 200},
		{domain.MimeTypePNG, 1, 1},
	}
	for _, tc := range cases {
		w, h, err := ReadDimensions(sized(t, tc.mime, tc.width, tc.height), tc.mime)
		if err != nil || w != tc.width || h != tc.height {
			t.Errorf("%s %dx%d: got %dx%d, %v", tc.mime, tc.width, tc.height, w, h, err)
		}
	}
}

// Las dimensiones se leen de la cabecera: una imagen de 24 MP se acepta sin
// decodificar sus píxeles (decodificarla ocuparía ~72 MB).
func TestReadDimensionsFromHeaderOnly(t *testing.T) {
	w, h, err := ReadDimensions(pngHeaderOnly(6000, 4000), domain.MimeTypePNG)
	if err != nil || w != 6000 || h != 4000 {
		t.Fatalf("got %dx%d, %v; want 6000x4000", w, h, err)
	}
}

func TestReadDimensionsRejectsDecompressionBombs(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		mime string
	}{
		{"PNG de 33 bytes que declara 20000×20000 (400 MP)", pngHeaderOnly(20000, 20000), domain.MimeTypePNG},
		{"PNG que declara 8000×8000 (64 MP)", pngHeaderOnly(8000, 8000), domain.MimeTypePNG},
		{"JPEG real de 8001×1 (lado mayor al máximo)", sized(t, domain.MimeTypeJPEG, 8001, 1), domain.MimeTypeJPEG},
	}
	for _, tc := range cases {
		if _, _, err := ReadDimensions(tc.data, tc.mime); !errors.Is(err, domain.ErrAttachmentDimensions) {
			t.Errorf("%s: want ErrAttachmentDimensions, got %v", tc.name, err)
		}
	}

	// Con el máximo que admite el formato (2^31-1 por lado) el propio decodificador
	// de Go detecta que ancho×alto se desborda y falla antes que nuestra regla: se
	// rechaza igual, como imagen dañada.
	_, _, err := ReadDimensions(pngHeaderOnly(1<<31-1, 1<<31-1), domain.MimeTypePNG)
	if !errors.Is(err, domain.ErrAttachmentDimensions) && !errors.Is(err, ErrAttachmentCorrupt) {
		t.Errorf("PNG que declara el máximo posible: debe rechazarse, got %v", err)
	}
}

func TestReadDimensionsRejectsCorruptFiles(t *testing.T) {
	realPNG := sized(t, domain.MimeTypePNG, 10, 10)
	realJPEG := sized(t, domain.MimeTypeJPEG, 10, 10)

	badCRC := pngHeaderOnly(100, 100)
	badCRC[len(badCRC)-1] ^= 0xFF // CRC de la cabecera alterado

	cases := []struct {
		name string
		data []byte
		mime string
	}{
		{"PNG con solo la firma", pngSignature, domain.MimeTypePNG},
		{"PNG cortado a la mitad de la cabecera", realPNG[:20], domain.MimeTypePNG},
		{"PNG con la cabecera alterada (CRC inválido)", badCRC, domain.MimeTypePNG},
		{"JPEG con solo la firma", jpegSignature, domain.MimeTypeJPEG},
		{"JPEG cortado antes de la cabecera de tamaño", realJPEG[:8], domain.MimeTypeJPEG},
		{"PNG presentado como JPEG", realPNG, domain.MimeTypeJPEG},
		{"JPEG presentado como PNG", realJPEG, domain.MimeTypePNG},
	}
	for _, tc := range cases {
		if _, _, err := ReadDimensions(tc.data, tc.mime); !errors.Is(err, ErrAttachmentCorrupt) {
			t.Errorf("%s: want ErrAttachmentCorrupt, got %v", tc.name, err)
		}
	}
}

func TestReadDimensionsRejectsUnsupportedType(t *testing.T) {
	_, _, err := ReadDimensions(sized(t, domain.MimeTypePNG, 2, 2), "image/gif")
	if !errors.Is(err, domain.ErrAttachmentUnsupportedType) {
		t.Fatalf("want ErrAttachmentUnsupportedType, got %v", err)
	}
}

func TestPNGHeaderOnlyIsTiny(t *testing.T) {
	// La "bomba" del test pesa 33 bytes: el límite de 5 MB por sí solo no la frena.
	if n := len(pngHeaderOnly(20000, 20000)); n != 33 {
		t.Fatalf("el PNG solo-cabecera debe pesar 33 bytes, pesa %d", n)
	}
}
