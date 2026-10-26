// Package attachment procesa las imágenes adjuntas a reclamos antes de
// guardarlas: lectura con límite, validación del contenido real, sanitización
// y enmascarado. No depende de HTTP ni de la base de datos.
package attachment

import (
	"errors"
	"fmt"
	"io"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// ErrAttachmentRead: no se pudo leer el archivo recibido (conexión cortada, etc.).
var ErrAttachmentRead = errors.New("no se pudo leer la imagen enviada")

// ReadLimited lee el archivo completo, pero nunca más de
// domain.MaxAttachmentSizeBytes + 1 bytes: si alguien envía un archivo enorme se
// corta apenas pasa el límite, sin cargarlo entero en memoria.
//
// El tamaño que declara el cliente (Content-Length o el del multipart) no se usa
// como garantía: solo cuenta lo que realmente se lee.
func ReadLimited(r io.Reader) ([]byte, error) {
	// Un byte más que el máximo basta para saber si el archivo lo supera.
	data, err := io.ReadAll(io.LimitReader(r, domain.MaxAttachmentSizeBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAttachmentRead, err)
	}
	if err := domain.ValidateAttachmentSize(int64(len(data))); err != nil {
		return nil, err
	}
	return data, nil
}
