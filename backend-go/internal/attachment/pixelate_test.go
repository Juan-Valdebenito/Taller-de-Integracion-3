package attachment

import (
	"image"
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
