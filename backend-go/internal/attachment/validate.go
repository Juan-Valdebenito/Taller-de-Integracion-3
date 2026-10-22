package attachment

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// ValidatedImage es una imagen recibida que pasó todas las validaciones y está
// lista para la sanitización. Todavía es el archivo tal como lo envió el
// cliente (con sus metadatos EXIF/GPS): no se debe guardar sin sanitizar.
type ValidatedImage struct {
	Data     []byte
	MimeType string
	Width    int
	Height   int
	// ReceivedSHA256 es el hash del archivo recibido, para auditoría y logs. El
	// hash que se guarda en la base es el de la imagen ya sanitizada.
	ReceivedSHA256 string
}

// ValidateUpload valida una imagen subida a un reclamo que ya tiene
// currentCount imágenes. Hace las comprobaciones de la más barata a la más cara:
//
//  1. máximo de imágenes por reclamo (antes de leer el archivo),
//  2. lectura con límite de tamaño,
//  3. tipo real según el contenido,
//  4. dimensiones desde la cabecera (sin decodificar los píxeles).
//
// Los errores son los del dominio o de este paquete; IsClientError indica si son
// culpa del archivo enviado (respuesta 4xx) o un problema interno.
func ValidateUpload(r io.Reader, currentCount int) (*ValidatedImage, error) {
	if err := domain.CanAddAttachment(currentCount); err != nil {
		return nil, err
	}
	data, err := ReadLimited(r)
	if err != nil {
		return nil, err
	}
	mimeType, err := DetectImageType(data)
	if err != nil {
		return nil, err
	}
	width, height, err := ReadDimensions(data, mimeType)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(data)
	return &ValidatedImage{
		Data:           data,
		MimeType:       mimeType,
		Width:          width,
		Height:         height,
		ReceivedSHA256: hex.EncodeToString(sum[:]),
	}, nil
}

// clientErrors: errores causados por el archivo o la solicitud del cliente.
var clientErrors = []error{
	domain.ErrAttachmentLimitReached,
	domain.ErrAttachmentEmpty,
	domain.ErrAttachmentTooLarge,
	domain.ErrAttachmentUnsupportedType,
	domain.ErrAttachmentDimensions,
	ErrAttachmentCorrupt,
	ErrAttachmentRead,
	ErrTooManyMaskRegions,
	ErrInvalidMaskRegion,
	ErrMaskRegionsTooLarge,
	ErrInvalidMaskRegionsFormat,
}

// IsClientError indica si el error de ValidateUpload se debe al archivo enviado
// (la API responde 4xx con el mensaje del error) y no a un fallo interno.
func IsClientError(err error) bool {
	for _, target := range clientErrors {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}
