package attachment

import (
	"errors"
	"image"
	"image/color"
	"testing"
)

func TestBlockSize(t *testing.T) {
	cases := []struct {
		name string
		zone image.Rectangle
		want int
	}{
		{"patente de 200×60", image.Rect(0, 0, 200, 60), 25},
		{"rostro de 400×400", image.Rect(100, 100, 500, 500), 50},
		{"zona vertical de 30×640", image.Rect(0, 0, 30, 640), 80},
		{"zona chica de 20×20 usa el mínimo", image.Rect(0, 0, 20, 20), MinBlockSize},
		{"un solo píxel usa el mínimo", image.Rect(5, 5, 6, 6), MinBlockSize},
		{"lado mayor no divisible redondea hacia arriba", image.Rect(0, 0, 801, 10), 101},
		{"toda una foto de 2048×1536", image.Rect(0, 0, 2048, 1536), 256},
	}
	for _, tc := range cases {
		if got := blockSize(tc.zone); got != tc.want {
			t.Errorf("%s: got %d, want %d", tc.name, got, tc.want)
		}
	}
}

// Ninguna zona queda con más de MaxBlocksAcross bloques en su lado mayor, y
// ningún bloque mide menos de MinBlockSize: es lo que hace irrecuperable el
// contenido oculto.
func TestBlockSizeNeverAllowsTooMuchDetail(t *testing.T) {
	for w := 1; w <= 2048; w += 37 {
		for _, h := range []int{1, 9, 60, 333, 1536} {
			zone := image.Rect(0, 0, w, h)
			size := blockSize(zone)
			if size < MinBlockSize {
				t.Fatalf("%dx%d: bloque de %d px, mínimo %d", w, h, size, MinBlockSize)
			}
			longest := max(w, h)
			blocks := (longest + size - 1) / size
			if blocks > MaxBlocksAcross {
				t.Fatalf("%dx%d: %d bloques en el lado mayor, máximo %d", w, h, blocks, MaxBlocksAcross)
			}
		}
	}
}

// detailed genera una imagen con mucho detalle: cada píxel de un color distinto,
// como el texto de una patente o los rasgos de un rostro.
func detailed(r image.Rectangle) *image.RGBA {
	img := image.NewRGBA(r)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			img.SetRGBA(x, y, color.RGBA{R: uint8(x * 37), G: uint8(y * 91), B: uint8((x ^ y) * 13), A: 255})
		}
	}
	return img
}

// Fuera de la zona no cambia ni un píxel.
func TestPixelateZoneLeavesTheRestUntouched(t *testing.T) {
	img := detailed(image.Rect(0, 0, 100, 80))
	original := detailed(image.Rect(0, 0, 100, 80))
	zone := image.Rect(30, 20, 70, 50)

	pixelateZone(img, zone)

	for y := 0; y < 80; y++ {
		for x := 0; x < 100; x++ {
			if image.Pt(x, y).In(zone) {
				continue
			}
			if img.RGBAAt(x, y) != original.RGBAAt(x, y) {
				t.Fatalf("(%d,%d) fuera de la zona cambió", x, y)
			}
		}
	}
}

// Cada bloque queda de un solo color: el promedio exacto de sus píxeles originales.
func TestPixelateZoneFillsEachBlockWithItsAverage(t *testing.T) {
	img := detailed(image.Rect(0, 0, 64, 64))
	original := detailed(image.Rect(0, 0, 64, 64))
	zone := image.Rect(0, 0, 64, 64) // bloques de 8 px: 8×8 bloques

	pixelateZone(img, zone)

	size := blockSize(zone)
	for by := 0; by < 64; by += size {
		for bx := 0; bx < 64; bx += size {
			var sum [3]int
			for y := by; y < by+size; y++ {
				for x := bx; x < bx+size; x++ {
					c := original.RGBAAt(x, y)
					sum[0] += int(c.R)
					sum[1] += int(c.G)
					sum[2] += int(c.B)
				}
			}
			n := size * size
			want := color.RGBA{uint8((sum[0] + n/2) / n), uint8((sum[1] + n/2) / n), uint8((sum[2] + n/2) / n), 255}
			for y := by; y < by+size; y++ {
				for x := bx; x < bx+size; x++ {
					if got := img.RGBAAt(x, y); got != want {
						t.Fatalf("bloque (%d,%d), píxel (%d,%d): got %v, want %v", bx, by, x, y, got, want)
					}
				}
			}
		}
	}
}

// El detalle desaparece: en una "patente" de 200×60 con cada píxel distinto
// quedan como mucho 8×3 colores (un color por bloque).
func TestPixelateZoneRemovesTheDetail(t *testing.T) {
	img := detailed(image.Rect(0, 0, 300, 120))
	plate := image.Rect(50, 30, 250, 90)

	before := distinctColors(img, plate)
	pixelateZone(img, plate)
	after := distinctColors(img, plate)

	if before < 1000 {
		t.Fatalf("la imagen de prueba debe tener mucho detalle, tiene %d colores", before)
	}
	if after > 8*3 {
		t.Fatalf("después de pixelar quedan %d colores en la patente, máximo %d", after, 8*3)
	}
}

func distinctColors(img *image.RGBA, zone image.Rectangle) int {
	seen := map[color.RGBA]bool{}
	for y := zone.Min.Y; y < zone.Max.Y; y++ {
		for x := zone.Min.X; x < zone.Max.X; x++ {
			seen[img.RGBAAt(x, y)] = true
		}
	}
	return len(seen)
}

// Los bloques del borde se recortan a la zona: 20 px con bloques de 8 = 8 + 8 + 4.
func TestPixelateZonePartialBlocksStayInsideTheZone(t *testing.T) {
	img := detailed(image.Rect(0, 0, 40, 40))
	original := detailed(image.Rect(0, 0, 40, 40))
	zone := image.Rect(10, 10, 30, 30)

	pixelateZone(img, zone)

	// El último bloque (columnas 26 a 29) es uniforme y la columna 30 no se tocó.
	if img.RGBAAt(26, 26) != img.RGBAAt(29, 29) {
		t.Error("el bloque parcial del borde debe ser de un solo color")
	}
	if img.RGBAAt(30, 26) != original.RGBAAt(30, 26) {
		t.Error("el bloque parcial no debe pintar fuera de la zona")
	}
}

// Una zona que sale de la imagen se recorta; una vacía no hace nada; no hay pánico.
func TestPixelateZoneClipsToTheImage(t *testing.T) {
	// Sale por la esquina: queda la zona 40..50 (10 px), con bloques de 8 px
	// recortados: 40..47 y 48..49 en cada eje.
	img := detailed(image.Rect(0, 0, 50, 50))
	original := detailed(image.Rect(0, 0, 50, 50))
	pixelateZone(img, image.Rect(40, 40, 90, 90))
	if img.RGBAAt(40, 40) != img.RGBAAt(47, 47) || img.RGBAAt(48, 48) != img.RGBAAt(49, 49) {
		t.Error("cada bloque de la parte dentro de la imagen debe ser de un solo color")
	}
	if img.RGBAAt(49, 49) == original.RGBAAt(49, 49) && img.RGBAAt(48, 49) == original.RGBAAt(48, 49) {
		t.Error("el borde de la imagen dentro de la zona también debe quedar pixelado")
	}
	if img.RGBAAt(39, 39) != original.RGBAAt(39, 39) {
		t.Error("fuera de la zona no debe cambiar")
	}

	before := detailed(image.Rect(0, 0, 50, 50))
	pixelateZone(before, image.Rect(60, 60, 80, 80)) // totalmente fuera
	pixelateZone(before, image.Rectangle{})          // vacía
	if before.RGBAAt(10, 10) != detailed(image.Rect(0, 0, 50, 50)).RGBAAt(10, 10) {
		t.Error("una zona fuera de la imagen o vacía no debe modificar nada")
	}
}

// Funciona con imágenes cuyo origen no es (0,0) (ej. recortes).
func TestPixelateZoneWithOffsetImage(t *testing.T) {
	img := detailed(image.Rect(100, 100, 164, 164))
	pixelateZone(img, image.Rect(100, 100, 108, 108))
	if img.RGBAAt(100, 100) != img.RGBAAt(107, 107) {
		t.Error("el bloque debe quedar de un solo color")
	}
	if img.RGBAAt(108, 100) == img.RGBAAt(107, 100) {
		t.Error("fuera de la zona debe conservar su color original")
	}
}

// Un píxel transparente junto a uno rojo opaco: promedio premultiplicado = rojo
// semitransparente (no un rojo oscurecido).
func TestPixelateZoneHandlesTransparency(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 2, 1))
	img.SetRGBA(0, 0, color.RGBA{0, 0, 0, 0})
	img.SetRGBA(1, 0, color.RGBA{255, 0, 0, 255})
	pixelateZone(img, img.Bounds())
	got := color.NRGBAModel.Convert(img.RGBAAt(0, 0)).(color.NRGBA)
	if got.R < 250 || got.A < 126 || got.A > 129 {
		t.Fatalf("want rojo puro con ~50%% de opacidad, got %v", got)
	}
}

func TestApplyMasksWithoutRegionsReturnsTheSameImage(t *testing.T) {
	img := detailed(image.Rect(0, 0, 40, 40))
	for _, regions := range [][]MaskRegion{nil, {}} {
		out, masked, err := applyMasks(img, regions)
		if err != nil || masked != 0 || out != image.Image(img) {
			t.Fatalf("sin zonas debe devolver la misma imagen: masked=%d, err=%v", masked, err)
		}
	}
}

// La zona relativa se aplica en la parte correcta de la foto y el resto queda igual.
func TestApplyMasksHidesTheMarkedArea(t *testing.T) {
	img := detailed(image.Rect(0, 0, 300, 120))
	plate := MaskRegion{X: 50.0 / 300, Y: 30.0 / 120, Width: 200.0 / 300, Height: 60.0 / 120}

	out, masked, err := applyMasks(img, []MaskRegion{plate})
	if err != nil || masked != 1 {
		t.Fatalf("masked=%d, err=%v", masked, err)
	}
	rgba := out.(*image.RGBA)
	zone := plate.ToPixels(300, 120)
	if zone != image.Rect(50, 30, 250, 90) {
		t.Fatalf("zona en píxeles: %v", zone)
	}
	if n := distinctColors(rgba, zone); n > 8*3 {
		t.Errorf("la patente conserva %d colores, máximo %d", n, 8*3)
	}
	for _, p := range []image.Point{{10, 10}, {290, 110}, {49, 60}, {250, 60}} {
		if rgba.RGBAAt(p.X, p.Y) != img.RGBAAt(p.X, p.Y) {
			t.Errorf("%v fuera de la zona cambió", p)
		}
	}
}

// La imagen original no se modifica (se trabaja sobre una copia).
func TestApplyMasksDoesNotModifyTheInput(t *testing.T) {
	img := detailed(image.Rect(0, 0, 64, 64))
	before := detailed(image.Rect(0, 0, 64, 64))
	if _, _, err := applyMasks(img, []MaskRegion{{X: 0, Y: 0, Width: 1, Height: 1}}); err != nil {
		t.Fatal(err)
	}
	if string(img.Pix) != string(before.Pix) {
		t.Fatal("applyMasks no debe modificar la imagen recibida")
	}
}

// Zonas superpuestas: ambas quedan ocultas y se cuentan las dos.
func TestApplyMasksOverlappingRegions(t *testing.T) {
	img := detailed(image.Rect(0, 0, 200, 200))
	regions := []MaskRegion{
		{X: 0.1, Y: 0.1, Width: 0.5, Height: 0.5},
		{X: 0.4, Y: 0.4, Width: 0.5, Height: 0.5},
	}
	out, masked, err := applyMasks(img, regions)
	if err != nil || masked != 2 {
		t.Fatalf("masked=%d, err=%v", masked, err)
	}
	rgba := out.(*image.RGBA)
	for i, r := range regions {
		zone := r.ToPixels(200, 200)
		// 100×100 px con bloques de 13 px: como mucho 8×8 bloques (más los de la
		// otra zona que se superponen encima).
		if n := distinctColors(rgba, zone); n > 2*8*8 {
			t.Errorf("zona %d conserva %d colores", i+1, n)
		}
	}
}

// Funciona con las imágenes que entrega el decodificador de JPEG (YCbCr) y con
// las que tienen transparencia (NRGBA).
func TestApplyMasksWithDecodedImageTypes(t *testing.T) {
	jpgImg := validated(t, gradient(64, 64, false), "image/jpeg")
	decoded, err := decodeImage(jpgImg.Data, jpgImg.MimeType)
	if err != nil {
		t.Fatal(err)
	}
	for _, img := range []image.Image{decoded, gradient(64, 64, true)} {
		out, masked, err := applyMasks(img, []MaskRegion{{X: 0, Y: 0, Width: 0.5, Height: 0.5}})
		if err != nil || masked != 1 || out.Bounds() != image.Rect(0, 0, 64, 64) {
			t.Fatalf("%T: masked=%d, bounds=%v, err=%v", img, masked, out.Bounds(), err)
		}
	}
}

// Las zonas se validan otra vez: una inválida no se aplica a medias.
func TestApplyMasksRejectsInvalidRegions(t *testing.T) {
	img := detailed(image.Rect(0, 0, 40, 40))
	_, masked, err := applyMasks(img, []MaskRegion{
		{X: 0, Y: 0, Width: 0.5, Height: 0.5},
		{X: 0.9, Y: 0, Width: 0.5, Height: 0.5}, // sale de la imagen
	})
	if !errors.Is(err, ErrInvalidMaskRegion) || masked != 0 {
		t.Fatalf("want ErrInvalidMaskRegion sin aplicar nada, got masked=%d, %v", masked, err)
	}
	if _, _, err := applyMasks(img, make([]MaskRegion, MaxMaskRegions+1)); !errors.Is(err, ErrTooManyMaskRegions) {
		t.Fatalf("want ErrTooManyMaskRegions, got %v", err)
	}
}
