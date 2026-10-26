package attachment

import "io"

// ProcessUpload procesa una imagen subida a un reclamo en un solo paso y la deja
// lista para guardar. Es lo que usa el endpoint de subida.
//
//   - file: el archivo tal como llega del cliente (se lee con límite de tamaño).
//   - currentCount: cuántas imágenes tiene ya el reclamo.
//   - maskRegionsJSON: las zonas a ocultar que envía la app ("" = ninguna).
//
// Va de lo más barato a lo más caro para rechazar lo antes posible: primero las
// zonas (texto chico) y el máximo de imágenes, sin leer el archivo; después la
// validación del archivo y, al final, la sanitización con las zonas ocultas.
// Los errores de entrada se reconocen con IsClientError (respuesta 4xx).
func ProcessUpload(file io.Reader, currentCount int, maskRegionsJSON string) (*SanitizedImage, error) {
	regions, err := ParseMaskRegions(maskRegionsJSON)
	if err != nil {
		return nil, err
	}
	validated, err := ValidateUpload(file, currentCount)
	if err != nil {
		return nil, err
	}
	return SanitizeWithMasks(validated, regions)
}
