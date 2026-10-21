package attachment

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"math/rand"
	"testing"
)

// exifSegment arma un bloque EXIF con la etiqueta Orientation en IFD0, con el
// orden de bytes pedido ("II" little endian, "MM" big endian).
func exifSegment(byteOrder string, orientation uint16) []byte {
	var order binary.ByteOrder = binary.BigEndian
	if byteOrder == "II" {
		order = binary.LittleEndian
	}
	tiff := make([]byte, 8+2+12+4)
	copy(tiff, byteOrder)
	order.PutUint16(tiff[2:], 42)
	order.PutUint32(tiff[4:], 8) // IFD0 justo después de la cabecera
	order.PutUint16(tiff[8:], 1) // una entrada
	order.PutUint16(tiff[10:], exifOrientationTag)
	order.PutUint16(tiff[12:], exifTypeShort)
	order.PutUint32(tiff[14:], 1)
	order.PutUint16(tiff[18:], orientation)
	return append(append([]byte{}, exifHeader...), tiff...)
}

// withAPP1 inserta un segmento APP1 justo después del inicio (SOI) del JPEG.
func withAPP1(jpg, payload []byte) []byte {
	seg := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(len(payload)+2))
	out := append([]byte{}, jpg[:2]...)
	out = append(out, seg...)
	out = append(out, payload...)
	return append(out, jpg[2:]...)
}

func plainJPEG(t *testing.T, img image.Image) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestJPEGOrientationReadsTheTag(t *testing.T) {
	base := plainJPEG(t, gradient(8, 8, false))
	for _, order := range []string{"II", "MM"} {
		for o := uint16(1); o <= 8; o++ {
			if got := jpegOrientation(withAPP1(base, exifSegment(order, o))); got != int(o) {
				t.Errorf("%s orientación %d: got %d", order, o, got)
			}
		}
	}
	if got := jpegOrientation(base); got != orientationNormal {
		t.Errorf("JPEG sin EXIF: got %d, want 1", got)
	}
}

// Datos inválidos o maliciosos: nunca entran en pánico y se asume orientación normal.
func TestJPEGOrientationIgnoresInvalidData(t *testing.T) {
	base := plainJPEG(t, gradient(8, 8, false))
	valid := exifSegment("MM", 6)

	outOfRange := exifSegment("MM", 9)
	wrongType := exifSegment("MM", 6)
	binary.BigEndian.PutUint16(wrongType[len(exifHeader)+12:], 4) // LONG en vez de SHORT
	hugeOffset := exifSegment("MM", 6)
	binary.BigEndian.PutUint32(hugeOffset[len(exifHeader)+4:], 0xFFFFFFFF)
	manyEntries := exifSegment("MM", 6)
	binary.BigEndian.PutUint16(manyEntries[len(exifHeader)+8:], 0xFFFF)
	badMagic := exifSegment("MM", 6)
	badMagic[len(exifHeader)+3] = 0

	cases := map[string][]byte{
		"orientación fuera de rango (9)":                  withAPP1(base, outOfRange),
		"tipo de dato incorrecto":                         withAPP1(base, wrongType),
		"posición del directorio enorme":                  withAPP1(base, hugeOffset),
		"más entradas que bytes":                          withAPP1(base, manyEntries),
		"número mágico TIFF inválido":                     withAPP1(base, badMagic),
		"APP1 que no es EXIF (ej. XMP)":                   withAPP1(base, []byte("http://ns.adobe.com/xap/1.0/\x00"+string(valid))),
		"EXIF cortado":                                    withAPP1(base, valid[:len(exifHeader)+5]),
		"segmento que dice medir más":                     append(base[:2:2], 0xFF, 0xE1, 0xFF, 0xFF, 'E', 'x'),
		"sin marcador de segmento":                        {0xFF, 0xD8, 0x00, 0x01, 0x02, 0x03},
		"no es JPEG":                                      []byte("hola"),
		"vacío":                                           nil,
		"EXIF después del inicio de la imagen comprimida": append(append([]byte{}, base...), withAPP1([]byte{0xFF, 0xD8}, valid)[2:]...),
	}
	for name, data := range cases {
		if got := jpegOrientation(data); got != orientationNormal {
			t.Errorf("%s: got %d, want 1", name, got)
		}
	}

	// Bytes al azar no deben provocar pánico (el resultado da igual).
	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 2000; i++ {
		junk := make([]byte, rng.Intn(64))
		rng.Read(junk)
		_ = jpegOrientation(append([]byte{0xFF, 0xD8}, junk...))
		_, _ = exifOrientation(append(append([]byte{}, exifHeader...), junk...))
	}
}

// Imagen de 3×2 con un color distinto por píxel para seguir cada uno.
func markers() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 3, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 3; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x * 100), G: uint8(y * 100), B: 7, A: 255})
		}
	}
	return img
}

func TestApplyOrientationAllEightCases(t *testing.T) {
	src := markers()
	at := func(x, y int) color.NRGBA { return src.NRGBAAt(x, y) }

	// Para cada orientación: tamaño del resultado y qué píxel del original queda
	// en cada esquina (arriba-izq., arriba-der., abajo-izq.).
	cases := []struct {
		orientation       int
		w, h              int
		topLeft, topRight color.NRGBA
		bottomLeft        color.NRGBA
	}{
		{1, 3, 2, at(0, 0), at(2, 0), at(0, 1)},
		{2, 3, 2, at(2, 0), at(0, 0), at(2, 1)},
		{3, 3, 2, at(2, 1), at(0, 1), at(2, 0)},
		{4, 3, 2, at(0, 1), at(2, 1), at(0, 0)},
		{5, 2, 3, at(0, 0), at(0, 1), at(2, 0)},
		{6, 2, 3, at(0, 1), at(0, 0), at(2, 1)},
		{7, 2, 3, at(2, 1), at(2, 0), at(0, 1)},
		{8, 2, 3, at(2, 0), at(2, 1), at(0, 0)},
	}
	for _, tc := range cases {
		out := applyOrientation(src, tc.orientation)
		b := out.Bounds()
		if b.Dx() != tc.w || b.Dy() != tc.h {
			t.Errorf("orientación %d: tamaño %dx%d, want %dx%d", tc.orientation, b.Dx(), b.Dy(), tc.w, tc.h)
			continue
		}
		px := func(x, y int) color.NRGBA {
			return color.NRGBAModel.Convert(out.At(b.Min.X+x, b.Min.Y+y)).(color.NRGBA)
		}
		if px(0, 0) != tc.topLeft || px(tc.w-1, 0) != tc.topRight || px(0, tc.h-1) != tc.bottomLeft {
			t.Errorf("orientación %d: esquinas %v %v %v, want %v %v %v", tc.orientation,
				px(0, 0), px(tc.w-1, 0), px(0, tc.h-1), tc.topLeft, tc.topRight, tc.bottomLeft)
		}
	}
}

func TestApplyOrientationIgnoresUnknownValues(t *testing.T) {
	src := markers()
	for _, o := range []int{0, 1, 9, -3} {
		if out := applyOrientation(src, o); out != image.Image(src) {
			t.Errorf("orientación %d no debe modificar la imagen", o)
		}
	}
}

// Caso real: foto vertical de celular guardada "acostada" con orientación 6.
// Tras sanitizar queda derecha (vertical) y sin EXIF.
func TestSanitizeAppliesPhoneOrientation(t *testing.T) {
	// Sensor apaisado de 32×16: mitad izquierda roja, mitad derecha azul.
	sensor := image.NewNRGBA(image.Rect(0, 0, 32, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 32; x++ {
			c := color.NRGBA{R: 220, A: 255}
			if x >= 16 {
				c = color.NRGBA{B: 220, A: 255}
			}
			sensor.SetNRGBA(x, y, c)
		}
	}
	photo := withAPP1(plainJPEG(t, sensor), exifSegment("II", 6))

	s := sanitizeUpload(t, photo)

	if s.Width != 16 || s.Height != 32 {
		t.Fatalf("la foto debe quedar vertical 16x32, quedó %dx%d", s.Width, s.Height)
	}
	if bytes.Contains(s.Data, exifHeader) {
		t.Fatal("la foto sanitizada no debe conservar el EXIF")
	}
	// Girar 90° a la derecha: lo que estaba a la izquierda (rojo) queda arriba.
	out, err := jpeg.Decode(bytes.NewReader(s.Data))
	if err != nil {
		t.Fatal(err)
	}
	r, _, b, _ := out.At(8, 4).RGBA()
	if r < b {
		t.Error("arriba debe quedar el rojo (la mitad izquierda del sensor)")
	}
	r, _, b, _ = out.At(8, 28).RGBA()
	if b < r {
		t.Error("abajo debe quedar el azul (la mitad derecha del sensor)")
	}
}
