package filestore

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
)

func newDiskStore(t *testing.T) *DiskStore {
	t.Helper()
	s, err := NewDiskStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// filesUnder lista los archivos (no carpetas) bajo la raíz, en rutas relativas.
func filesUnder(t *testing.T, root string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(root, func(p string, e fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !e.IsDir() {
			rel, _ := filepath.Rel(root, p)
			files = append(files, filepath.ToSlash(rel))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func TestNewDiskStoreCreatesTheRoot(t *testing.T) {
	root := filepath.Join(t.TempDir(), "data", "attachments")
	s, err := NewDiskStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		t.Fatalf("la carpeta raíz debe existir: %v", err)
	}
	if !filepath.IsAbs(s.Root()) {
		t.Fatalf("la raíz debe guardarse como ruta absoluta: %q", s.Root())
	}
}

// El archivo queda en root/complaints/<reclamo>/<nombre>.jpg con el contenido exacto.
func TestDiskPutWritesTheFileUnderItsComplaintFolder(t *testing.T) {
	s := newDiskStore(t)
	key := newKey(t, "comp-seed-03")
	data := []byte("\xff\xd8\xff imagen sanitizada")

	if err := s.Put(context.Background(), key, data); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(s.Root(), filepath.FromSlash(key)))
	if err != nil || string(got) != string(data) {
		t.Fatalf("contenido en disco: %q, %v", got, err)
	}
	if files := filesUnder(t, s.Root()); len(files) != 1 || files[0] != key {
		t.Fatalf("en la carpeta debe haber solo la imagen, hay %v", files)
	}
}

// Ni al guardar bien ni al rechazar por duplicado quedan temporales.
func TestDiskPutLeavesNoTemporaryFiles(t *testing.T) {
	s := newDiskStore(t)
	ctx := context.Background()
	key := newKey(t, "comp-1")
	if err := s.Put(ctx, key, []byte("original")); err != nil {
		t.Fatal(err)
	}
	if err := s.Put(ctx, key, []byte("otro")); !errors.Is(err, ErrFileExists) {
		t.Fatalf("want ErrFileExists, got %v", err)
	}
	for _, f := range filesUnder(t, s.Root()) {
		if strings.Contains(f, ".upload-") || strings.HasSuffix(f, ".tmp") {
			t.Errorf("quedó un archivo temporal: %s", f)
		}
	}
	got, _ := os.ReadFile(filepath.Join(s.Root(), filepath.FromSlash(key)))
	if string(got) != "original" {
		t.Fatalf("el original no debe sobrescribirse: %q", got)
	}
}

func TestDiskPutPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows no usa permisos Unix")
	}
	s := newDiskStore(t)
	key := newKey(t, "comp-1")
	if err := s.Put(context.Background(), key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(s.Root(), filepath.FromSlash(key)))
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != filePerm {
		t.Fatalf("permisos del archivo: %o, want %o", perm, filePerm)
	}
}

// Los nombres manipulados no crean nada en el disco, ni dentro ni fuera de la raíz.
func TestDiskPutRejectsTamperedKeys(t *testing.T) {
	parent := t.TempDir()
	s, err := NewDiskStore(filepath.Join(parent, "attachments"))
	if err != nil {
		t.Fatal(err)
	}
	token := strings.Repeat("ab", 16)
	for _, key := range []string{
		"complaints/c1/../../../escape.jpg",
		"complaints/../../" + token + ".jpg",
		"/complaints/c1/" + token + ".jpg",
		`complaints\c1\` + token + ".jpg",
	} {
		if err := s.Put(context.Background(), key, []byte("x")); !errors.Is(err, attachment.ErrInvalidStorageKey) {
			t.Errorf("%q: want ErrInvalidStorageKey, got %v", key, err)
		}
	}
	if files := filesUnder(t, parent); len(files) != 0 {
		t.Fatalf("no debe crearse ningún archivo: %v", files)
	}
}

func TestDiskPutCancelledContext(t *testing.T) {
	s := newDiskStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Put(ctx, newKey(t, "comp-1"), []byte("x")); !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	if files := filesUnder(t, s.Root()); len(files) != 0 {
		t.Fatalf("no debe crearse ningún archivo: %v", files)
	}
}

// Varias subidas simultáneas con el mismo nombre: gana exactamente una, su
// contenido queda completo y no quedan temporales.
func TestDiskPutConcurrentSameKey(t *testing.T) {
	s := newDiskStore(t)
	key := newKey(t, "comp-1")
	const writers = 8
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs <- s.Put(context.Background(), key, []byte(fmt.Sprintf("version-%d-%s", i, strings.Repeat("x", 4096))))
		}(i)
	}
	wg.Wait()
	close(errs)
	ok := 0
	for err := range errs {
		if err == nil {
			ok++
		} else if !errors.Is(err, ErrFileExists) {
			t.Errorf("error inesperado: %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("exactamente un Put debe ganar, ganaron %d", ok)
	}
	got, _ := os.ReadFile(filepath.Join(s.Root(), filepath.FromSlash(key)))
	if !strings.HasPrefix(string(got), "version-") || len(got) < 4096 {
		t.Fatalf("el archivo ganador debe quedar completo, mide %d bytes", len(got))
	}
	if files := filesUnder(t, s.Root()); len(files) != 1 {
		t.Fatalf("debe quedar solo la imagen: %v", files)
	}
}
