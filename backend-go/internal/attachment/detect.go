package attachment

import (
	"bytes"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Firmas ("magic bytes") con que empieza cada formato permitido.
var (
	// JPEG: marcador SOI (FF D8) seguido del inicio de otro marcador (FF).
	jpegSignature = []byte{0xFF, 0xD8, 0xFF}
	// PNG: firma fija de 8 bytes definida por la especificación.
	pngSignature = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}
)

// DetectImageType devuelve el tipo MIME real de la imagen según sus primeros
// bytes. La extensión del archivo y el Content-Type que envía el cliente no se
// consideran: se pueden falsificar (ej. un script renombrado a "foto.jpg").
//
// Solo reconoce los tipos permitidos (JPEG y PNG); cualquier otro contenido
// devuelve domain.ErrAttachmentUnsupportedType. Que la firma sea correcta no
// garantiza que el resto del archivo lo sea: eso lo comprueban la lectura de la
// cabecera y la sanitización.
func DetectImageType(data []byte) (string, error) {
	switch {
	case bytes.HasPrefix(data, jpegSignature):
		return domain.MimeTypeJPEG, nil
	case bytes.HasPrefix(data, pngSignature):
		return domain.MimeTypePNG, nil
	}
	return "", domain.ErrAttachmentUnsupportedType
}
