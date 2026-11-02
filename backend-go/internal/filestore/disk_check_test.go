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

// Al iniciar: crea la carpeta (con sus carpetas intermedias) y comprueba que se
// pueda escribir.
func TestOpenDiskCreatesAndChecksTheFolder(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "data", "attachments")
	s, err := OpenDisk(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		t.Fatalf("la carpeta debe crearse: %v", err)
	}
	if !filepath.IsAbs(s.Root()) {
		t.Errorf("la raíz debe ser absoluta: %q", s.Root())
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("no deben quedar archivos de prueba: %v", entries)
	}
}

// Si la carpeta no sirve, devuelve error (y el backend sigue sin imágenes).
func TestOpenDiskFailsWhenTheFolderIsUnusable(t *testing.T) {
	file := filepath.Join(t.TempDir(), "soy-un-archivo")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Una carpeta "dentro" de un archivo no se puede crear.
	s, err := OpenDisk(context.Background(), filepath.Join(file, "attachments"))
	if err == nil || s != nil {
		t.Fatalf("una ruta inválida debe fallar, got %v, %v", s, err)
	}
}

func TestOpenDiskCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if s, err := OpenDisk(ctx, t.TempDir()); !errors.Is(err, context.Canceled) || s != nil {
		t.Fatalf("want context.Canceled, got %v, %v", s, err)
	}
}
