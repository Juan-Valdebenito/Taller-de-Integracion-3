package filestore

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
)

func TestDiskOpenReadsTheSavedFile(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	key := newKey(t, "comp-1")
	data := bytes.Repeat([]byte("imagen "), 10_000) // ~70 KB

	if err := s.Put(ctx, key, data); err != nil {
		t.Fatal(err)
	}
	r, size, err := s.Open(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	got, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, data) || size != int64(len(data)) {
		t.Fatalf("leídos %d bytes (tamaño informado %d), want %d", len(got), size, len(data))
	}
}

// Se puede leer por partes (para enviarlo en la descarga sin cargarlo entero).
func TestDiskOpenCanBeReadInChunks(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	key := newKey(t, "comp-1")
	if err := s.Put(ctx, key, []byte("0123456789")); err != nil {
		t.Fatal(err)
	}
	r, _, err := s.Open(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	chunk := make([]byte, 4)
	var parts []string
	for {
		n, err := r.Read(chunk)
		if n > 0 {
			parts = append(parts, string(chunk[:n]))
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	if strings.Join(parts, "") != "0123456789" || len(parts) < 3 {
		t.Fatalf("lectura por partes: %q", parts)
	}
}

func TestDiskOpenMissingFile(t *testing.T) {
	s := newDiskStore(t)
	if _, _, err := s.Open(context.Background(), newKey(t, "comp-1")); !errors.Is(err, ErrFileNotFound) {
		t.Fatalf("want ErrFileNotFound, got %v", err)
	}
}

// Una carpeta con el nombre de la imagen no se abre como si fuera la imagen.
func TestDiskOpenRefusesDirectories(t *testing.T) {
	s := newDiskStore(t)
	key := newKey(t, "comp-1")
	if err := os.MkdirAll(filepath.Join(s.Root(), filepath.FromSlash(key)), 0o750); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Open(context.Background(), key); !errors.Is(err, ErrFileNotFound) {
		t.Fatalf("want ErrFileNotFound, got %v", err)
	}
}

// Un enlace simbólico con el nombre de una imagen, que apunta a un archivo de
// fuera de la carpeta, no se sigue.
func TestDiskOpenRefusesSymlinks(t *testing.T) {
	s := newDiskStore(t)
	secret := filepath.Join(t.TempDir(), "secreto.txt")
	if err := os.WriteFile(secret, []byte("datos privados del servidor"), 0o600); err != nil {
		t.Fatal(err)
	}
	key := newKey(t, "comp-1")
	link := filepath.Join(s.Root(), filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(link), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, link); err != nil {
		// En Windows crear enlaces simbólicos requiere permisos especiales.
		t.Skipf("no se pudo crear el enlace simbólico en este sistema: %v", err)
	}
	r, _, err := s.Open(context.Background(), key)
	if r != nil {
		r.Close()
	}
	if !errors.Is(err, ErrFileNotFound) {
		t.Fatalf("un enlace simbólico no debe abrirse: got %v", err)
	}
}

func TestDiskOpenRejectsTamperedKeys(t *testing.T) {
	s := newDiskStore(t)
	token := strings.Repeat("ab", 16)
	for _, key := range []string{
		"complaints/c1/../../../etc/passwd",
		"/complaints/c1/" + token + ".jpg",
		`complaints\c1\` + token + ".jpg",
	} {
		if _, _, err := s.Open(context.Background(), key); !errors.Is(err, attachment.ErrInvalidStorageKey) {
			t.Errorf("%q: want ErrInvalidStorageKey, got %v", key, err)
		}
	}
}

func TestDiskOpenCancelledContext(t *testing.T) {
	s := newDiskStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := s.Open(ctx, newKey(t, "comp-1")); !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
}
