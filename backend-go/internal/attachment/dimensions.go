package attachment

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"image/png"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// ErrAttachmentCorrupt: el archivo tiene la firma de una imagen pero su cabecera
// está dañada, incompleta o no corresponde al tipo detectado.
var ErrAttachmentCorrupt = errors.New("la imagen está dañada o incompleta")

// ReadDimensions lee el ancho y el alto desde la cabecera de la imagen, sin
// decodificar los píxeles, y aplica los límites del dominio. Así una "bomba" de
// descompresión (archivo chico que declara 20000×20000 px) se rechaza antes de
// reservar memoria para ella.
//
// mimeType es el tipo detectado por DetectImageType: se usa el decodificador de
// ese formato y no uno genérico, para que un archivo no pase como otro tipo.
func ReadDimensions(data []byte, mimeType string) (width, height int, err error) {
	var decodeConfig func(r *bytes.Reader) (image.Config, error)
	switch mimeType {
	case domain.MimeTypeJPEG:
		decodeConfig = func(r *bytes.Reader) (image.Config, error) { return jpeg.DecodeConfig(r) }
	case domain.MimeTypePNG:
		decodeConfig = func(r *bytes.Reader) (image.Config, error) { return png.DecodeConfig(r) }
	default:
		return 0, 0, domain.ErrAttachmentUnsupportedType
	}

	cfg, err := decodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0, ErrAttachmentCorrupt
	}
	if err := domain.ValidateAttachmentDimensions(cfg.Width, cfg.Height); err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}
