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
	// MaskedRegions: cuántas zonas (rostros, patentes) quedaron pixeladas.
	MaskedRegions int
}

// Sanitize vuelve a codificar una imagen ya validada para eliminar todo lo que
// no son píxeles: metadatos con datos personales (ubicación GPS, modelo del
// teléfono, fecha), comentarios y contenido escondido o pegado al final del
// archivo. El resultado se valida otra vez con las reglas del dominio.
func Sanitize(v *ValidatedImage) (*SanitizedImage, error) {
	return SanitizeWithMasks(v, nil)
}

// SanitizeWithMasks hace lo mismo que Sanitize y además pixela las zonas que
// marcó el pasajero (coordenadas relativas sobre la foto tal como la ve). El
// archivo resultante ya no contiene los píxeles originales de esas zonas.
func SanitizeWithMasks(v *ValidatedImage, regions []MaskRegion) (*SanitizedImage, error) {
	if v == nil {
		return nil, errors.New("attachment: SanitizeWithMasks recibió una imagen nil")
	}
	data, img, masked, err := reencodeWithMasks(v, regions)
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
		Data:          data,
		MimeType:      v.MimeType,
		Width:         bounds.Dx(),
		Height:        bounds.Dy(),
		SizeBytes:     size,
		SHA256:        hex.EncodeToString(sum[:]),
		MaskedRegions: masked,
	}, nil
}

// ToAttachment arma el registro para la base de datos (tabla
// complaint_attachments) de esta imagen, guardada bajo storageKey. id y
// createdAt los asigna la base al guardarlo.
func (s *SanitizedImage) ToAttachment(complaintID, storageKey string, uploadedBy *string) domain.ComplaintAttachment {
	return domain.ComplaintAttachment{
		ComplaintID:   complaintID,
		StorageKey:    storageKey,
		MimeType:      s.MimeType,
		SizeBytes:     s.SizeBytes,
		Width:         s.Width,
		Height:        s.Height,
		SHA256:        s.SHA256,
		MaskedRegions: s.MaskedRegions,
		UploadedBy:    uploadedBy,
	}
}
