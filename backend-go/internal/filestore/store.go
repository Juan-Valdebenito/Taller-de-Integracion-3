// Package filestore guarda los archivos de las imágenes de reclamos (ya
// sanitizadas) bajo su nombre interno. La base de datos solo guarda los
// metadatos; este paquete guarda los bytes.
package filestore

import (
	"context"
	"errors"
	"io"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
)

var (
	// ErrFileExists: ya hay un archivo con ese nombre interno (nunca se sobrescribe).
	ErrFileExists = errors.New("filestore: el archivo ya existe")
	// ErrFileNotFound: no hay ningún archivo con ese nombre interno.
	ErrFileNotFound = errors.New("filestore: el archivo no existe")
)

// Store guarda, abre y borra archivos por su nombre interno (storageKey).
//
// Todas las implementaciones validan el nombre con attachment.ParseStorageKey
// antes de usarlo: un nombre manipulado devuelve attachment.ErrInvalidStorageKey
// y nunca llega al almacenamiento.
type Store interface {
	// Put guarda el archivo. Devuelve ErrFileExists si ya existe uno con ese nombre.
	Put(ctx context.Context, key string, data []byte) error
	// Open abre el archivo para leerlo y devuelve su tamaño en bytes. Quien
	// llama debe cerrarlo. Devuelve ErrFileNotFound si no existe.
	Open(ctx context.Context, key string) (io.ReadCloser, int64, error)
	// Delete borra el archivo. Devuelve ErrFileNotFound si no existe.
	Delete(ctx context.Context, key string) error
}

// validateKey comprueba el nombre interno antes de cualquier operación.
func validateKey(key string) error {
	_, err := attachment.ParseStorageKey(key)
	return err
}
