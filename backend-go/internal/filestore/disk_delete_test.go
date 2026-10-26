package filestore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
)

// DiskStore cumple la interfaz Store y pasa la misma batería de contrato que
// MemoryStore: ambas se comportan exactamente igual.
var _ Store = (*DiskStore)(nil)

func TestDiskStoreContract(t *testing.T) {
	testStoreContract(t, func(t *testing.T) Store { return newDiskStore(t) })
}

func complaintDir(s *DiskStore, key string) string {
	return filepath.Dir(filepath.Join(s.Root(), filepath.FromSlash(key)))
}

// Al borrar la última imagen de un reclamo, su carpeta también se borra.
func TestDiskDeleteRemovesTheEmptyComplaintFolder(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	key := newKey(t, "comp-1")
	if err := s.Put(ctx, key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(complaintDir(s, key)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("la carpeta vacía del reclamo debe borrarse: %v", err)
	}
	// La carpeta raíz se mantiene.
	if _, err := os.Stat(s.Root()); err != nil {
		t.Fatalf("la carpeta raíz no debe borrarse: %v", err)
	}
}

// Si el reclamo tiene más imágenes, la carpeta se mantiene con las demás.
func TestDiskDeleteKeepsTheFolderWithOtherImages(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	a, b := newKey(t, "comp-1"), newKey(t, "comp-1")
	for _, k := range []string{a, b} {
		if err := s.Put(ctx, k, []byte(k)); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Delete(ctx, a); err != nil {
		t.Fatal(err)
	}
	if got, _ := readAll(t, s, b); string(got) != b {
		t.Fatalf("la otra imagen del reclamo debe seguir: %q", got)
	}
	if files := filesUnder(t, s.Root()); len(files) != 1 || files[0] != b {
		t.Fatalf("debe quedar solo la otra imagen: %v", files)
	}
}

// Una carpeta con el nombre de la imagen no se borra.
func TestDiskDeleteRefusesDirectories(t *testing.T) {
	s := newDiskStore(t)
	key := newKey(t, "comp-1")
	target := filepath.Join(s.Root(), filepath.FromSlash(key))
	if err := os.MkdirAll(target, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(context.Background(), key); !errors.Is(err, ErrFileNotFound) {
		t.Fatalf("want ErrFileNotFound, got %v", err)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("la carpeta no debe borrarse: %v", err)
	}
}

func TestDiskDeleteRejectsTamperedKeys(t *testing.T) {
	parent := t.TempDir()
	outside := filepath.Join(parent, "importante.txt")
	if err := os.WriteFile(outside, []byte("no borrar"), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := NewDiskStore(filepath.Join(parent, "attachments"))
	if err != nil {
		t.Fatal(err)
	}
	token := strings.Repeat("ab", 16)
	for _, key := range []string{
		"complaints/c1/../../../importante.txt",
		"/complaints/c1/" + token + ".jpg",
		`complaints\c1\` + token + ".jpg",
	} {
		if err := s.Delete(context.Background(), key); !errors.Is(err, attachment.ErrInvalidStorageKey) {
			t.Errorf("%q: want ErrInvalidStorageKey, got %v", key, err)
		}
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("un archivo de fuera de la carpeta nunca debe borrarse: %v", err)
	}
}

// Borrar la última imagen de un reclamo mientras se sube otra al mismo reclamo:
// la subida no falla aunque la carpeta se borre en el medio.
func TestDiskDeleteAndPutSameComplaintConcurrently(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	for round := 0; round < 50; round++ {
		old := newKey(t, "comp-1")
		if err := s.Put(ctx, old, []byte("vieja")); err != nil {
			t.Fatal(err)
		}
		fresh := newKey(t, "comp-1")
		var wg sync.WaitGroup
		var putErr, delErr error
		wg.Add(2)
		go func() { defer wg.Done(); delErr = s.Delete(ctx, old) }()
		go func() { defer wg.Done(); putErr = s.Put(ctx, fresh, []byte("nueva")) }()
		wg.Wait()
		if delErr != nil || putErr != nil {
			t.Fatalf("ronda %d: delete=%v put=%v", round, delErr, putErr)
		}
		if got, _ := readAll(t, s, fresh); string(got) != "nueva" {
			t.Fatalf("ronda %d: la imagen nueva debe quedar guardada: %q", round, got)
		}
		if err := s.Delete(ctx, fresh); err != nil {
			t.Fatal(err)
		}
	}
}
