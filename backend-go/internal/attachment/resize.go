package attachment

import (
	"image"
	"image/draw"
	"math"
)

// MaxStoredDimension es el lado mayor máximo, en píxeles, de las imágenes que se
// guardan. Basta para ver el detalle de un reclamo (una patente, un asiento roto)
// y deja una foto de celular de 12 MP en unos pocos cientos de KB.
const MaxStoredDimension = 2048

// fitWithin calcula el tamaño que cabe en maxSide×maxSide manteniendo la
// proporción. Si la imagen ya cabe, devuelve el mismo tamaño.
func fitWithin(width, height, maxSide int) (int, int) {
	if width <= maxSide && height <= maxSide {
		return width, height
	}
	scale := float64(maxSide) / float64(max(width, height))
	nw := max(1, int(math.Round(float64(width)*scale)))
	nh := max(1, int(math.Round(float64(height)*scale)))
	return min(nw, maxSide), min(nh, maxSide)
}

// limitSize reduce la imagen si su lado mayor supera MaxStoredDimension.
func limitSize(img image.Image) image.Image {
	b := img.Bounds()
	nw, nh := fitWithin(b.Dx(), b.Dy(), MaxStoredDimension)
	if nw == b.Dx() && nh == b.Dy() {
		return img
	}
	return downscale(img, nw, nh)
}

// contribution: píxeles de origen que cubre un píxel de destino en un eje, con
// la fracción de cada uno que queda dentro.
type contribution struct {
	start   int
	weights []float64
}

// contributions calcula, para cada píxel de destino, qué píxeles de origen
// cubre y en qué fracción (promedio de área, sirve solo para achicar).
func contributions(srcSize, dstSize int) []contribution {
	scale := float64(srcSize) / float64(dstSize)
	out := make([]contribution, dstSize)
	for i := range out {
		from, to := float64(i)*scale, float64(i+1)*scale
		first, last := int(math.Floor(from)), int(math.Ceil(to))
		last = min(last, srcSize)
		weights := make([]float64, 0, last-first)
		for j := first; j < last; j++ {
			weights = append(weights, math.Min(to, float64(j+1))-math.Max(from, float64(j)))
		}
		out[i] = contribution{start: first, weights: weights}
	}
	return out
}

// downscale achica la imagen a width×height con promedio de área: cada píxel
// nuevo es el promedio exacto de los píxeles originales que cubre. Promedia en
// RGBA premultiplicado para que la transparencia no oscurezca los bordes.
// Procesa una fila de destino a la vez para no reservar memoria extra grande.
func downscale(img image.Image, width, height int) *image.RGBA {
	b := img.Bounds()
	src := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(src, src.Bounds(), img, b.Min, draw.Src)

	cols := contributions(b.Dx(), width)
	rows := contributions(b.Dy(), height)
	area := (float64(b.Dx()) / float64(width)) * (float64(b.Dy()) / float64(height))

	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	acc := make([]float64, width*4)  // suma de la fila de destino actual
	line := make([]float64, width*4) // una fila de origen ya reducida en horizontal
	for dy, row := range rows {
		clear(acc)
		for k, wy := range row.weights {
			sy := row.start + k
			srcRow := src.Pix[sy*src.Stride:]
			for dx, col := range cols {
				var r, g, bl, a float64
				for m, wx := range col.weights {
					p := srcRow[(col.start+m)*4:]
					r += wx * float64(p[0])
					g += wx * float64(p[1])
					bl += wx * float64(p[2])
					a += wx * float64(p[3])
				}
				line[dx*4], line[dx*4+1], line[dx*4+2], line[dx*4+3] = r, g, bl, a
			}
			for i, v := range line {
				acc[i] += wy * v
			}
		}
		out := dst.Pix[dy*dst.Stride:]
		for i, v := range acc {
			out[i] = uint8(math.Min(255, math.Max(0, math.Round(v/area))))
		}
	}
	return dst
}
