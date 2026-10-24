package filestore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// En una carpeta normal la prueba pasa y no deja ningún archivo.
func TestCheckWritableOK(t *testing.T) {
	s := newDiskStore(t)
	if err := s.CheckWritable(context.Background()); err != nil {
		t.Fatalf("una carpeta normal debe permitir escribir: %v", err)
	}
	entries, err := os.ReadDir(s.Root())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("la prueba no debe dejar archivos: %v", entries)
	}
}

// Si la carpeta desaparece después de iniciar (ej. volumen desmontado), la
// prueba falla con un error claro que incluye la ruta.
func TestCheckWritableMissingFolder(t *testing.T) {
	s := newDiskStore(t)
	if err := os.RemoveAll(s.Root()); err != nil {
		t.Fatal(err)
	}
	err := s.CheckWritable(context.Background())
	if !errors.Is(err, ErrNotWritable) {
		t.Fatalf("want ErrNotWritable, got %v", err)
	}
	if !strings.Contains(err.Error(), s.Root()) {
		t.Errorf("el error debe decir qué carpeta falla: %v", err)
	}
}

// Si en lugar de la carpeta hay un archivo con ese nombre, no se puede escribir.
func TestCheckWritableWhenRootIsAFile(t *testing.T) {
	s := newDiskStore(t)
	if err := os.RemoveAll(s.Root()); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.Root(), []byte("no soy una carpeta"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckWritable(context.Background()); !errors.Is(err, ErrNotWritable) {
		t.Fatalf("want ErrNotWritable, got %v", err)
	}
}

// Carpeta en solo lectura (como un volumen montado sin permiso de escritura).
func TestCheckWritableReadOnlyFolder(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows no aplica permisos Unix de solo lectura a carpetas")
	}
	if os.Geteuid() == 0 {
		t.Skip("root puede escribir aunque la carpeta sea de solo lectura")
	}
	root := filepath.Join(t.TempDir(), "solo-lectura")
	s, err := NewDiskStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(root, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(root, 0o750) })
	if err := s.CheckWritable(context.Background()); !errors.Is(err, ErrNotWritable) {
		t.Fatalf("want ErrNotWritable, got %v", err)
	}
}

func TestCheckWritableCancelledContext(t *testing.T) {
	s := newDiskStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.CheckWritable(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
}
