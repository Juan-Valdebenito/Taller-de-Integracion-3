package filestore

import (
	"bytes"
	"context"
	"io"
	"sync"
)

// MemoryStore guarda los archivos en memoria. Sirve para tests (por ejemplo,
// los del endpoint de subida): se comporta igual que el almacenamiento en disco.
// Es seguro para usar desde varias goroutines.
type MemoryStore struct {
	mu    sync.RWMutex
	files map[string][]byte
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{files: map[string][]byte{}}
}

func (m *MemoryStore) Put(ctx context.Context, key string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateKey(key); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.files[key]; exists {
		return ErrFileExists
	}
	// Copia: cambios posteriores en data no deben alterar el archivo guardado.
	m.files[key] = bytes.Clone(data)
	return nil
}

func (m *MemoryStore) Open(ctx context.Context, key string) (io.ReadCloser, int64, error) {
	if err := ctx.Err(); err != nil {
		return nil, 0, err
	}
	if err := validateKey(key); err != nil {
		return nil, 0, err
	}
	m.mu.RLock()
	data, exists := m.files[key]
	m.mu.RUnlock()
	if !exists {
		return nil, 0, ErrFileNotFound
	}
	return io.NopCloser(bytes.NewReader(data)), int64(len(data)), nil
}

func (m *MemoryStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateKey(key); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.files[key]; !exists {
		return ErrFileNotFound
	}
	delete(m.files, key)
	return nil
}

// Len devuelve cuántos archivos hay guardados (útil en tests).
func (m *MemoryStore) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.files)
}
