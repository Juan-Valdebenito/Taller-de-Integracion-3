package domain

import (
	"errors"
	"fmt"
	"strings"
)

// Reglas de las imágenes adjuntas a reclamos. Las usan la validación de la
// subida (antes de procesar el archivo) y el guardado (sobre la imagen ya
// sanitizada). La base de datos tiene topes más amplios como red de seguridad.
const (
	// MaxAttachmentSizeBytes es el tamaño máximo de cada imagen (5 MB).
	MaxAttachmentSizeBytes int64 = 5 << 20
	// MaxAttachmentsPerComplaint es la cantidad máxima de imágenes por reclamo.
	MaxAttachmentsPerComplaint = 3
	// MaxAttachmentDimension es el máximo de ancho y de alto, en píxeles.
	MaxAttachmentDimension = 8000
	// MaxAttachmentPixels limita ancho×alto (24 megapíxeles): una imagen chica en
	// bytes puede ocupar gigas de memoria al decodificarse ("bomba" de descompresión).
	MaxAttachmentPixels = 24_000_000
)

const (
	MimeTypeJPEG = "image/jpeg"
	MimeTypePNG  = "image/png"
)

// allowedAttachmentTypes: tipos aceptados y la extensión con que se guardan.
var allowedAttachmentTypes = map[string]string{
	MimeTypeJPEG: ".jpg",
	MimeTypePNG:  ".png",
}

var (
	ErrAttachmentUnsupportedType = errors.New("formato de imagen no permitido: solo JPEG o PNG")
	ErrAttachmentEmpty           = errors.New("la imagen está vacía")
	ErrAttachmentTooLarge        = fmt.Errorf("la imagen supera el tamaño máximo de %d MB", MaxAttachmentSizeBytes>>20)
	ErrAttachmentDimensions      = fmt.Errorf("las dimensiones de la imagen no son válidas (máximo %d px por lado y %d megapíxeles)", MaxAttachmentDimension, MaxAttachmentPixels/1_000_000)
	ErrAttachmentLimitReached    = fmt.Errorf("el reclamo ya tiene el máximo de %d imágenes", MaxAttachmentsPerComplaint)
	ErrAttachmentInvalidHash     = errors.New("el hash SHA-256 de la imagen no es válido")
	ErrAttachmentInvalid         = errors.New("los datos de la imagen adjunta no son válidos")
)

// IsAllowedAttachmentType indica si el tipo MIME (detectado por el contenido) está permitido.
func IsAllowedAttachmentType(mimeType string) bool {
	_, ok := allowedAttachmentTypes[mimeType]
	return ok
}

// AttachmentExtension devuelve la extensión con que se guarda un tipo permitido (".jpg", ".png").
func AttachmentExtension(mimeType string) (string, error) {
	ext, ok := allowedAttachmentTypes[mimeType]
	if !ok {
		return "", ErrAttachmentUnsupportedType
	}
	return ext, nil
}

// ValidateAttachmentSize comprueba el tamaño en bytes (sirve antes de leer todo el archivo).
func ValidateAttachmentSize(sizeBytes int64) error {
	switch {
	case sizeBytes <= 0:
		return ErrAttachmentEmpty
	case sizeBytes > MaxAttachmentSizeBytes:
		return ErrAttachmentTooLarge
	}
	return nil
}

// ValidateAttachmentDimensions comprueba ancho y alto. Se usa con la cabecera de
// la imagen, antes de decodificarla completa.
func ValidateAttachmentDimensions(width, height int) error {
	if width <= 0 || height <= 0 || width > MaxAttachmentDimension || height > MaxAttachmentDimension {
		return ErrAttachmentDimensions
	}
	// int64 para que el producto no se desborde.
	if int64(width)*int64(height) > MaxAttachmentPixels {
		return ErrAttachmentDimensions
	}
	return nil
}

// CanAddAttachment indica si un reclamo que ya tiene `current` imágenes admite otra.
func CanAddAttachment(current int) error {
	if current >= MaxAttachmentsPerComplaint {
		return ErrAttachmentLimitReached
	}
	return nil
}

// Validate comprueba un adjunto completo antes de guardarlo (imagen ya sanitizada).
func (a ComplaintAttachment) Validate() error {
	if strings.TrimSpace(a.ComplaintID) == "" || strings.TrimSpace(a.StorageKey) == "" || a.MaskedRegions < 0 {
		return ErrAttachmentInvalid
	}
	if !IsAllowedAttachmentType(a.MimeType) {
		return ErrAttachmentUnsupportedType
	}
	if err := ValidateAttachmentSize(a.SizeBytes); err != nil {
		return err
	}
	if err := ValidateAttachmentDimensions(a.Width, a.Height); err != nil {
		return err
	}
	if !isSHA256Hex(a.SHA256) {
		return ErrAttachmentInvalidHash
	}
	return nil
}

// isSHA256Hex: 64 caracteres hexadecimales en minúscula (mismo formato que exige la base de datos).
func isSHA256Hex(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
