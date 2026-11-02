package attachment

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"

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

var (
	// ErrInvalidComplaintID: el id del reclamo tiene caracteres que no pueden ir
	// en una ruta de archivo.
	ErrInvalidComplaintID = errors.New("el identificador del reclamo no es válido")
	// ErrInvalidStorageKey: el nombre interno no tiene el formato que genera
	// NewStorageKey (posible manipulación o dato dañado).
	ErrInvalidStorageKey = errors.New("attachment: nombre interno de archivo inválido")
)

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

// StorageKeyInfo son los datos que se deducen de un nombre interno válido.
type StorageKeyInfo struct {
	ComplaintID string
	MimeType    string
}

// ParseStorageKey comprueba que un nombre interno tenga exactamente el formato
// de NewStorageKey antes de usarlo para leer o borrar un archivo. Es una defensa
// adicional: aunque un nombre manipulado llegara a la base de datos, nunca podría
// apuntar fuera de la carpeta de imágenes ("../", rutas absolutas, "\").
func ParseStorageKey(key string) (StorageKeyInfo, error) {
	rest, ok := strings.CutPrefix(key, storageKeyPrefix)
	if !ok {
		return StorageKeyInfo{}, ErrInvalidStorageKey
	}
	complaintID, file, ok := strings.Cut(rest, "/")
	if !ok || !validComplaintID(complaintID) {
		return StorageKeyInfo{}, ErrInvalidStorageKey
	}
	token, ext, ok := strings.Cut(file, ".")
	if !ok || len(token) != hex.EncodedLen(tokenBytes) || !isLowerHex(token) {
		return StorageKeyInfo{}, ErrInvalidStorageKey
	}
	mimeType, ok := mimeTypeForExtension["."+ext]
	if !ok {
		return StorageKeyInfo{}, ErrInvalidStorageKey
	}
	return StorageKeyInfo{ComplaintID: complaintID, MimeType: mimeType}, nil
}

// ValidateStorageKeyFor comprueba que el nombre interno sea válido y pertenezca
// al reclamo indicado (una imagen no puede apuntar al archivo de otro reclamo).
func ValidateStorageKeyFor(key, complaintID string) error {
	info, err := ParseStorageKey(key)
	if err != nil {
		return err
	}
	if info.ComplaintID != complaintID {
		return ErrInvalidStorageKey
	}
	return nil
}

// mimeTypeForExtension: extensiones que genera NewStorageKey y su tipo.
var mimeTypeForExtension = map[string]string{
	".jpg": domain.MimeTypeJPEG,
	".png": domain.MimeTypePNG,
}

func isLowerHex(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
