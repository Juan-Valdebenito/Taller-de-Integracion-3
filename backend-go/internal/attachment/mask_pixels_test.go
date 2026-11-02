package attachment

import (
	"image"
	"testing"
)

func TestMaskRegionToPixels(t *testing.T) {
	cases := []struct {
		name          string
		region        MaskRegion
		width, height int
		want          image.Rectangle
	}{
		{
			"coordenadas exactas",
			MaskRegion{X: 0.25, Y: 0.5, Width: 0.5, Height: 0.25},
			200, 100, image.Rect(50, 50, 150, 75),
		},
		{
			"toda la foto",
			MaskRegion{X: 0, Y: 0, Width: 1, Height: 1},
			2048, 1536, image.Rect(0, 0, 2048, 1536),
		},
		{
			// 0.333×100 = 33.3 → empieza en 33; (0.333+0.334)×100 = 66.7 → termina en 67.
			"bordes fraccionarios se redondean hacia afuera",
			MaskRegion{X: 0.333, Y: 0.333, Width: 0.334, Height: 0.334},
			100, 100, image.Rect(33, 33, 67, 67),
		},
		{
			// 1 % de 50 px = 0.5 px: igual cubre al menos un píxel completo.
			"zona mínima en una imagen chica cubre al menos 1 px",
			MaskRegion{X: 0.5, Y: 0.5, Width: MinMaskRegionSize, Height: MinMaskRegionSize},
			50, 50, image.Rect(25, 25, 26, 26),
		},
		{
			// 0.7+0.3 da 1.0000000000000002: se recorta al borde, no lo pasa.
			"error de redondeo en el borde se recorta",
			MaskRegion{X: 0.7, Y: 0.7, Width: 0.3, Height: 0.3},
			1000, 1000, image.Rect(700, 700, 1000, 1000),
		},
	}
	for _, tc := range cases {
		if got := tc.region.ToPixels(tc.width, tc.height); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

// La misma zona relativa cubre la misma parte de la foto a cualquier tamaño:
// por eso sigue siendo correcta después de reducir la imagen.
func TestMaskRegionToPixelsScalesWithTheImage(t *testing.T) {
	plate := MaskRegion{X: 0.4, Y: 0.6, Width: 0.2, Height: 0.1}
	original := plate.ToPixels(4000, 3000)
	reduced := plate.ToPixels(2048, 1536)
	if original != image.Rect(1600, 1800, 2400, 2100) {
		t.Fatalf("original: %v", original)
	}
	// 0.4×2048 = 819.2 → 819; 0.6×2048 = 1228.8 → 1229; 0.6×1536 = 921.6 → 921; 0.7×1536 = 1075.2 → 1076.
	if reduced != image.Rect(819, 921, 1229, 1076) {
		t.Fatalf("reducida: %v", reduced)
	}
}

// El ruido de float64 no agrega píxeles de más; las fracciones reales sí se
// redondean hacia afuera.
func TestPixelRoundingTolerance(t *testing.T) {
	cases := []struct {
		v           float64
		floor, ceil int
	}{
		{(0.4 + 0.2) * 4000, 2400, 2400}, // 2400.0000000000005: es 2400
		{0.7 * 10, 7, 7},                 // 7.000000000000001
		{0.29 * 100, 29, 29},             // 28.999999999999996
		{66.7, 66, 67},                   // fracción real
		{33.3, 33, 34},
		{0, 0, 0},
	}
	for _, tc := range cases {
		if got := floorPixel(tc.v); got != tc.floor {
			t.Errorf("floorPixel(%v) = %d, want %d", tc.v, got, tc.floor)
		}
		if got := ceilPixel(tc.v); got != tc.ceil {
			t.Errorf("ceilPixel(%v) = %d, want %d", tc.v, got, tc.ceil)
		}
	}
}

// Para toda zona válida, el rectángulo nunca sale de la imagen y nunca queda vacío.
func TestMaskRegionToPixelsAlwaysInsideAndNotEmpty(t *testing.T) {
	sizes := [][2]int{{1, 1}, {7, 3}, {640, 480}, {2048, 1365}, {1, 2048}}
	steps := []float64{0, 0.01, 0.1, 0.333, 0.5, 0.75, 0.99}
	for _, size := range sizes {
		bounds := image.Rect(0, 0, size[0], size[1])
		for _, x := range steps {
			for _, w := range steps[1:] {
				r := MaskRegion{X: x, Y: x, Width: w, Height: w}
				if r.Validate() != nil {
					continue
				}
				px := r.ToPixels(size[0], size[1])
				if !px.In(bounds) || px.Empty() {
					t.Fatalf("%+v en %dx%d: %v (fuera o vacío)", r, size[0], size[1], px)
				}
			}
		}
	}
}
