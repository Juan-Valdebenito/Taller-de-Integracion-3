package attachment

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// Pruebas de punta a punta del pipeline con una "foto de celular": el sensor
// guarda la imagen apaisada con orientación EXIF 6 (girar 90° a la derecha) y
// el pasajero marca las zonas sobre la foto ya derecha, tal como la ve en la app.

// phonePhoto arma un JPEG de w×h (como lo guarda el sensor) con fondo liso y
// "patentes" (tablero de casillas de cell px, mucho detalle) en los rectángulos
// indicados, en coordenadas del sensor, y le agrega la orientación EXIF indicada.
// En fotos que se reducen se usan casillas más grandes para que el detalle
// sobreviva a la reducción (si no, la reducción sola ya las dejaría lisas).
func phonePhoto(t *testing.T, w, h, cell int, orientation uint16, plates ...image.Rectangle) []byte {
	t.Helper()
	sensor := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{R: 90, G: 140, B: 200, A: 255} // cielo liso
			for _, p := range plates {
				if image.Pt(x, y).In(p) {
					c = color.RGBA{A: 255}
					if (x/cell+y/cell)%2 == 0 { // tablero: como letras y números
						c = color.RGBA{R: 250, G: 250, B: 250, A: 255}
					}
				}
			}
			sensor.SetRGBA(x, y, c)
		}
	}
	return withAPP1(plainJPEG(t, sensor), exifSegment("II", orientation))
}

// sensorRectForDisplayed90 convierte un rectángulo de la foto derecha a
// coordenadas del sensor para la orientación 6 (sensor de w×h, foto h×w).
// Girar 90° a la derecha lleva el píxel (x, y) del sensor a (h-1-y, x).
func sensorRectForDisplayed90(displayed image.Rectangle, sensorHeight int) image.Rectangle {
	return image.Rect(displayed.Min.Y, sensorHeight-displayed.Max.X, displayed.Max.Y, sensorHeight-displayed.Min.X)
}

// detail mide cuánto cambia el color entre píxeles vecinos dentro del
// rectángulo (0 = liso). Una patente legible tiene mucho; una pixelada, casi nada.
func detail(img image.Image, r image.Rectangle) float64 {
	gray := func(x, y int) float64 {
		cr, cg, cb, _ := img.At(x, y).RGBA()
		return (0.299*float64(cr) + 0.587*float64(cg) + 0.114*float64(cb)) / 257
	}
	var sum float64
	var n int
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X-1; x++ {
			d := gray(x, y) - gray(x+1, y)
			if d < 0 {
				d = -d
			}
			sum += d
			n++
		}
	}
	return sum / float64(n)
}

func decodeJPEG(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	return img
}

// relative convierte un rectángulo en píxeles de la foto derecha a la zona
// relativa que enviaría la app.
func relative(r image.Rectangle, w, h int) MaskRegion {
	return MaskRegion{
		X: float64(r.Min.X) / float64(w), Y: float64(r.Min.Y) / float64(h),
		Width: float64(r.Dx()) / float64(w), Height: float64(r.Dy()) / float64(h),
	}
}

// Detalle mínimo de una patente legible y máximo de una pixelada (JPEG agrega
// un poco de ruido en los bordes de los bloques).
const (
	readableDetail = 40
	hiddenDetail   = 8
	// Con casillas de 16 px hay menos bordes por píxel: el detalle de una patente
	// visible es menor, pero sigue muy por encima de una pixelada.
	readableCoarseDetail = 20
)

// Foto vertical guardada apaisada (EXIF 6): la patente marcada sobre la foto
// derecha queda oculta en el lugar correcto.
func TestEndToEndPlateOnRotatedPhonePhoto(t *testing.T) {
	const sensorW, sensorH = 640, 480 // la foto derecha mide 480×640
	plateShown := image.Rect(140, 420, 340, 480)
	photo := phonePhoto(t, sensorW, sensorH, 2, 6, sensorRectForDisplayed90(plateShown, sensorH))

	// Sin ocultar: la foto queda derecha y la patente se lee en su lugar.
	plain := sanitizeUpload(t, photo)
	if plain.Width != 480 || plain.Height != 640 {
		t.Fatalf("la foto debe quedar vertical 480x640, quedó %dx%d", plain.Width, plain.Height)
	}
	before := detail(decodeJPEG(t, plain.Data), plateShown)
	if before < readableDetail {
		t.Fatalf("sin ocultar, la patente debería verse en %v (detalle %.1f)", plateShown, before)
	}

	// Ocultando la zona que marcó el pasajero.
	v := mustValidate(t, photo)
	masked, err := SanitizeWithMasks(v, []MaskRegion{relative(plateShown, 480, 640)})
	if err != nil {
		t.Fatal(err)
	}
	out := decodeJPEG(t, masked.Data)
	after := detail(out, plateShown)
	t.Logf("detalle de la patente: %.1f sin ocultar, %.1f oculta", before, after)
	if after > hiddenDetail {
		t.Errorf("la patente sigue legible después de ocultarla (detalle %.1f)", after)
	}
	if masked.MaskedRegions != 1 || bytes.Contains(masked.Data, exifHeader) {
		t.Errorf("MaskedRegions=%d; el EXIF no debe conservarse", masked.MaskedRegions)
	}
	// El cielo de alrededor no cambia (sigue liso y del mismo color).
	if d := detail(out, image.Rect(20, 20, 200, 200)); d > 2 {
		t.Errorf("el resto de la foto no debería cambiar (detalle %.1f)", d)
	}
}

// Si las coordenadas se aplicaran sobre la imagen del sensor (sin girar), la
// zona caería en otro lugar y la patente seguiría visible. Este test confirma
// que el pixelado se aplica sobre la foto derecha.
func TestEndToEndZonesUseTheDisplayedOrientation(t *testing.T) {
	const sensorW, sensorH = 640, 480
	plateShown := image.Rect(140, 420, 340, 480)
	plateSensor := sensorRectForDisplayed90(plateShown, sensorH)
	photo := phonePhoto(t, sensorW, sensorH, 2, 6, plateSensor)

	// Zona con las coordenadas del sensor (lo que pasaría si se ignorara el giro).
	wrong := relative(plateSensor, sensorW, sensorH)
	masked, err := SanitizeWithMasks(mustValidate(t, photo), []MaskRegion{wrong})
	if err != nil {
		t.Fatal(err)
	}
	d := detail(decodeJPEG(t, masked.Data), plateShown)
	t.Logf("detalle de la patente con la zona mal ubicada: %.1f", d)
	if d < readableDetail {
		t.Fatalf("con coordenadas del sensor la patente no debería quedar oculta (detalle %.1f)", d)
	}
}

// Foto grande (se reduce a 2048 px) con dos zonas: un rostro y una patente.
func TestEndToEndLargePhotoWithTwoZones(t *testing.T) {
	const sensorW, sensorH = 4000, 3000 // la foto derecha mide 3000×4000 → se reduce a 1536×2048
	faceShown := image.Rect(1200, 600, 1800, 1400)
	plateShown := image.Rect(900, 3300, 2100, 3600)
	photo := phonePhoto(t, sensorW, sensorH, 16, 6,
		sensorRectForDisplayed90(faceShown, sensorH), sensorRectForDisplayed90(plateShown, sensorH))
	zones := []MaskRegion{relative(faceShown, 3000, 4000), relative(plateShown, 3000, 4000)}

	// Sin ocultar: después de reducir, el rostro y la patente se siguen viendo
	// (si no, el test no probaría nada).
	plain := sanitizeUpload(t, photo)
	plainImg := decodeJPEG(t, plain.Data)
	for i, z := range zones {
		px := z.ToPixels(plain.Width, plain.Height)
		d := detail(plainImg, px.Inset(2))
		t.Logf("zona %d sin ocultar en la foto reducida: detalle %.1f", i+1, d)
		if d < readableCoarseDetail {
			t.Fatalf("zona %d debería verse en la foto reducida sin ocultar (detalle %.1f)", i+1, d)
		}
	}

	masked, err := SanitizeWithMasks(mustValidate(t, photo), zones)
	if err != nil {
		t.Fatal(err)
	}
	if masked.Width != 1536 || masked.Height != 2048 || masked.MaskedRegions != 2 {
		t.Fatalf("got %dx%d con %d zonas, want 1536x2048 con 2", masked.Width, masked.Height, masked.MaskedRegions)
	}
	out := decodeJPEG(t, masked.Data)
	for i, z := range zones {
		// La zona relativa, en píxeles de la foto ya reducida.
		px := z.ToPixels(masked.Width, masked.Height)
		d := detail(out, px.Inset(2))
		t.Logf("zona %d en la foto reducida %v: detalle %.1f", i+1, px, d)
		if d > hiddenDetail {
			t.Errorf("zona %d (%v) sigue legible después de reducir y ocultar (detalle %.1f)", i+1, px, d)
		}
	}
}

func mustValidate(t *testing.T, data []byte) *ValidatedImage {
	t.Helper()
	v, err := ValidateUpload(bytes.NewReader(data), 0)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
