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
