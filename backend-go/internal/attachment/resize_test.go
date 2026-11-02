package attachment

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

func TestFitWithin(t *testing.T) {
	cases := []struct {
		w, h, wantW, wantH int
	}{
		{4000, 3000, 2048, 1536}, // foto de celular apaisada (12 MP)
		{3000, 4000, 1536, 2048}, // la misma, vertical
		{2048, 2048, 2048, 2048}, // justo en el límite: no cambia
		{1280, 960, 1280, 960},   // ya es chica: no cambia
		{6000, 4000, 2048, 1365}, // 24 MP
		{8000, 10, 2048, 3},      // panorámica muy delgada
		{5000, 1, 2048, 1},       // nunca menos de 1 px
	}
	for _, tc := range cases {
		w, h := fitWithin(tc.w, tc.h, MaxStoredDimension)
		if w != tc.wantW || h != tc.wantH {
			t.Errorf("%dx%d: got %dx%d, want %dx%d", tc.w, tc.h, w, h, tc.wantW, tc.wantH)
		}
	}
}

func filled(width, height int, c color.Color) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, c)
		}
	}
	return img
}

func TestDownscaleKeepsAUniformColor(t *testing.T) {
	c := color.RGBA{R: 10, G: 120, B: 230, A: 255}
	out := downscale(filled(7, 5, c), 3, 2) // proporción no entera
	for y := 0; y < 2; y++ {
		for x := 0; x < 3; x++ {
			if got := out.RGBAAt(x, y); got != c {
				t.Fatalf("(%d,%d): got %v, want %v", x, y, got, c)
			}
		}
	}
}

// Promedio de área exacto: 4×1 → 2×1 promedia cada par de píxeles.
func TestDownscaleAveragesTheCoveredPixels(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 4, 1))
	src.SetRGBA(0, 0, color.RGBA{0, 0, 0, 255})
	src.SetRGBA(1, 0, color.RGBA{100, 100, 100, 255})
	src.SetRGBA(2, 0, color.RGBA{200, 0, 0, 255})
	src.SetRGBA(3, 0, color.RGBA{250, 0, 0, 255})

	out := downscale(src, 2, 1)
	if got := out.RGBAAt(0, 0); got != (color.RGBA{50, 50, 50, 255}) {
		t.Errorf("izquierda: got %v", got)
	}
	if got := out.RGBAAt(1, 0); got != (color.RGBA{225, 0, 0, 255}) {
		t.Errorf("derecha: got %v", got)
	}
}

// Un tablero blanco y negro se ve gris al achicarlo (sin patrones dentados).
func TestDownscaleCheckerboardBecomesGray(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			if (x+y)%2 == 0 {
				src.SetRGBA(x, y, color.RGBA{255, 255, 255, 255})
			} else {
				src.SetRGBA(x, y, color.RGBA{0, 0, 0, 255})
			}
		}
	}
	out := downscale(src, 16, 16)
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			if v := out.RGBAAt(x, y).R; v < 126 || v > 129 {
				t.Fatalf("(%d,%d): gris esperado ~128, got %d", x, y, v)
			}
		}
	}
}

// El color promedio de toda la imagen se conserva, también con proporciones no enteras.
func TestDownscalePreservesTheMeanColor(t *testing.T) {
	src := gradient(97, 61, false)
	out := downscale(src, 40, 25)
	mean := func(img image.Image) float64 {
		b := img.Bounds()
		var sum float64
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				r, _, _, _ := img.At(x, y).RGBA()
				sum += float64(r >> 8)
			}
		}
		return sum / float64(b.Dx()*b.Dy())
	}
	if d := math.Abs(mean(src) - mean(out)); d > 1 {
		t.Fatalf("el color promedio cambió %.2f niveles", d)
	}
}

// Mezclar un píxel transparente con uno rojo opaco da rojo semitransparente,
// no un rojo oscurecido (por eso se promedia en RGBA premultiplicado).
func TestDownscaleHandlesTransparency(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	src.SetNRGBA(0, 0, color.NRGBA{0, 0, 0, 0})
	src.SetNRGBA(1, 0, color.NRGBA{255, 0, 0, 255})
	out := downscale(src, 1, 1)
	got := color.NRGBAModel.Convert(out.At(0, 0)).(color.NRGBA)
	if got.R < 250 || got.A < 126 || got.A > 129 {
		t.Fatalf("want rojo puro con ~50%% de opacidad, got %v", got)
	}
}

func TestLimitSizeLeavesSmallImagesUntouched(t *testing.T) {
	img := gradient(MaxStoredDimension, 100, false)
	if out := limitSize(img); out != image.Image(img) {
		t.Fatal("una imagen que ya cabe no debe procesarse")
	}
}

func TestSanitizeReducesLargeImages(t *testing.T) {
	cases := []struct {
		mime               string
		w, h, wantW, wantH int
	}{
		{domain.MimeTypeJPEG, 4000, 3000, 2048, 1536}, // foto de celular de 12 MP
		{domain.MimeTypePNG, 3000, 1000, 2048, 683},
	}
	for _, tc := range cases {
		var buf bytes.Buffer
		img := image.NewGray(image.Rect(0, 0, tc.w, tc.h))
		var err error
		if tc.mime == domain.MimeTypeJPEG {
			err = jpeg.Encode(&buf, img, nil)
		} else {
			err = png.Encode(&buf, img)
		}
		if err != nil {
			t.Fatal(err)
		}

		s := sanitizeUpload(t, buf.Bytes())
		if s.Width != tc.wantW || s.Height != tc.wantH {
			t.Errorf("%s %dx%d: quedó %dx%d, want %dx%d", tc.mime, tc.w, tc.h, s.Width, s.Height, tc.wantW, tc.wantH)
		}
		w, h, err := ReadDimensions(s.Data, s.MimeType)
		if err != nil || w != tc.wantW || h != tc.wantH {
			t.Errorf("%s: el archivo guardado mide %dx%d (%v)", tc.mime, w, h, err)
		}
	}
}
