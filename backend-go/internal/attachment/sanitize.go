package attachment

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// SanitizedImage es la imagen lista para guardar: generada de nuevo desde los
// píxeles, sin metadatos (EXIF, GPS, comentarios, miniaturas) ni bytes extra.
type SanitizedImage struct {
	Data      []byte
	MimeType  string
	Width     int
	Height    int
	SizeBytes int64
	// SHA256 del archivo sanitizado: es el que se guarda en la base de datos.
	SHA256 string
}

// Sanitize vuelve a codificar una imagen ya validada para eliminar todo lo que
// no son píxeles: metadatos con datos personales (ubicación GPS, modelo del
// teléfono, fecha), comentarios y contenido escondido o pegado al final del
// archivo. El resultado se valida otra vez con las reglas del dominio.
func Sanitize(v *ValidatedImage) (*SanitizedImage, error) {
	if v == nil {
		return nil, errors.New("attachment: Sanitize recibió una imagen nil")
	}
	data, img, err := reencode(v)
	if err != nil {
		return nil, err
	}
	size := int64(len(data))
	if err := domain.ValidateAttachmentSize(size); err != nil {
		return nil, err
	}
	bounds := img.Bounds()
	sum := sha256.Sum256(data)
	return &SanitizedImage{
		Data:      data,
		MimeType:  v.MimeType,
		Width:     bounds.Dx(),
		Height:    bounds.Dy(),
		SizeBytes: size,
		SHA256:    hex.EncodeToString(sum[:]),
	}, nil
}
