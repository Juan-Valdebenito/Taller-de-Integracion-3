package attachment

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Formato del nombre interno de cada imagen en el almacenamiento:
//
//	complaints/<id del reclamo>/<32 caracteres hexadecimales aleatorios>.<jpg|png>
//
// El nombre original del archivo nunca se usa: puede traer datos personales o
// rutas maliciosas ("../../etc/passwd").
const (
	storageKeyPrefix = "complaints/"
	// tokenBytes: 16 bytes = 128 bits aleatorios, imposibles de adivinar o repetir.
	tokenBytes = 16
	// maxComplaintIDLength: los ids son UUID (36) o del seeder ("comp-seed-03").
	maxComplaintIDLength = 64
)

// ErrInvalidComplaintID: el id del reclamo tiene caracteres que no pueden ir en
// una ruta de archivo.
var ErrInvalidComplaintID = errors.New("el identificador del reclamo no es válido")

// randomSource es la fuente de aleatoriedad criptográfica (se reemplaza en tests).
var randomSource io.Reader = rand.Reader

// validComplaintID acepta solo letras ASCII, dígitos, "-" y "_". Así el id no
// puede contener "/", "\", ".." ni caracteres raros que cambien la ruta.
func validComplaintID(id string) bool {
	if id == "" || len(id) > maxComplaintIDLength {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// NewStorageKey genera el nombre interno, único y aleatorio, para guardar una
// imagen ya sanitizada de un reclamo.
func NewStorageKey(complaintID, mimeType string) (string, error) {
	if !validComplaintID(complaintID) {
		return "", ErrInvalidComplaintID
	}
	ext, err := domain.AttachmentExtension(mimeType)
	if err != nil {
		return "", err
	}
	token := make([]byte, tokenBytes)
	if _, err := io.ReadFull(randomSource, token); err != nil {
		return "", fmt.Errorf("attachment: no se pudo generar el nombre del archivo: %w", err)
	}
	return storageKeyPrefix + complaintID + "/" + hex.EncodeToString(token) + ext, nil
}
