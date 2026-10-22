package attachment

import "image"

// Tamaño de los bloques del pixelado. Cada zona queda dividida en, como mucho,
// MaxBlocksAcross bloques en su lado mayor: una patente de 200×60 px queda en
// 8×3 bloques (ilegible) y un rostro en un mosaico de 8×8 (irreconocible),
// sin importar la resolución de la foto.
const (
	// MaxBlocksAcross: bloques como máximo en el lado mayor de la zona.
	MaxBlocksAcross = 8
	// MinBlockSize: un bloque nunca mide menos de esto, en píxeles, para que
	// zonas chicas también queden borrosas y no solo "cuadriculadas".
	MinBlockSize = 8
)

// blockSize devuelve el lado, en píxeles, de los bloques cuadrados con que se
// pixela la zona. Crece con la zona para que el resultado no se pueda leer ni
// reconocer.
func blockSize(zone image.Rectangle) int {
	longest := max(zone.Dx(), zone.Dy())
	// División redondeada hacia arriba: nunca más de MaxBlocksAcross bloques.
	size := (longest + MaxBlocksAcross - 1) / MaxBlocksAcross
	return max(size, MinBlockSize)
}

// pixelateZone reemplaza, dentro de la zona, cada bloque por su color promedio.
// Modifica img directamente y no toca nada fuera de la zona: los bloques del
// borde se recortan a la zona. La zona se recorta a los límites de la imagen.
// Promedia en RGBA premultiplicado (el formato de image.RGBA), para que los
// píxeles transparentes de un PNG no oscurezcan el resultado.
func pixelateZone(img *image.RGBA, zone image.Rectangle) {
	zone = zone.Intersect(img.Bounds())
	if zone.Empty() {
		return
	}
	size := blockSize(zone)
	for by := zone.Min.Y; by < zone.Max.Y; by += size {
		for bx := zone.Min.X; bx < zone.Max.X; bx += size {
			block := image.Rect(bx, by, bx+size, by+size).Intersect(zone)
			fillWithAverage(img, block)
		}
	}
}

// fillWithAverage pinta todo el bloque con el promedio de sus píxeles.
func fillWithAverage(img *image.RGBA, block image.Rectangle) {
	var sum [4]uint64
	for y := block.Min.Y; y < block.Max.Y; y++ {
		row := img.Pix[img.PixOffset(block.Min.X, y):img.PixOffset(block.Max.X, y)]
		for i := 0; i < len(row); i += 4 {
			sum[0] += uint64(row[i])
			sum[1] += uint64(row[i+1])
			sum[2] += uint64(row[i+2])
			sum[3] += uint64(row[i+3])
		}
	}
	n := uint64(block.Dx() * block.Dy())
	var avg [4]uint8
	for c := range avg {
		avg[c] = uint8((sum[c] + n/2) / n) // redondeo al entero más cercano
	}
	for y := block.Min.Y; y < block.Max.Y; y++ {
		row := img.Pix[img.PixOffset(block.Min.X, y):img.PixOffset(block.Max.X, y)]
		for i := 0; i < len(row); i += 4 {
			copy(row[i:i+4], avg[:])
		}
	}
}
