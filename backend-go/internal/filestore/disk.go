package filestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
)

// Permisos: solo el usuario del backend (y su grupo, para leer) accede a las imágenes.
const (
	dirPerm  fs.FileMode = 0o750
	filePerm fs.FileMode = 0o640
	// tempPattern: los temporales empiezan con "." para distinguirlos de las imágenes.
	tempPattern = ".upload-*.tmp"
)

// DiskStore guarda las imágenes en una carpeta del disco (en el cluster, un
// volumen persistente). Cada nombre interno es una ruta relativa a esa carpeta:
// root/complaints/<id del reclamo>/<nombre aleatorio>.jpg
type DiskStore struct {
	root string
}

// NewDiskStore usa (y crea si no existe) la carpeta raíz de las imágenes.
func NewDiskStore(root string) (*DiskStore, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("filestore: carpeta de imágenes inválida %q: %w", root, err)
	}
	if err := os.MkdirAll(abs, dirPerm); err != nil {
		return nil, fmt.Errorf("filestore: no se pudo crear la carpeta de imágenes %q: %w", abs, err)
	}
	return &DiskStore{root: abs}, nil
}

// Root devuelve la carpeta raíz absoluta.
func (d *DiskStore) Root() string { return d.root }

// OpenTimeout limita cuánto espera OpenDisk por el disco al iniciar (un volumen
// de red colgado no debe dejar el backend sin arrancar).
const OpenTimeout = 5 * time.Second

// OpenDisk prepara el almacenamiento al iniciar el backend: crea la carpeta si
// no existe y comprueba que se pueda escribir en ella. Si devuelve error, el
// backend debe seguir funcionando con las imágenes desactivadas.
func OpenDisk(ctx context.Context, dir string) (*DiskStore, error) {
	ctx, cancel := context.WithTimeout(ctx, OpenTimeout)
	defer cancel()
	store, err := NewDiskStore(dir)
	if err != nil {
		return nil, err
	}
	if err := store.CheckWritable(ctx); err != nil {
		return nil, err
	}
	return store, nil
}

// ErrNotWritable: en la carpeta de imágenes no se puede escribir (solo lectura,
// sin permisos, disco lleno o volumen mal montado).
var ErrNotWritable = errors.New("filestore: no se puede escribir en la carpeta de imágenes")

// CheckWritable comprueba que en la carpeta raíz realmente se pueda escribir:
// crea un archivo de prueba, lo fuerza a disco y lo borra. Que la carpeta exista
// no basta (puede estar en solo lectura); así el problema se detecta al iniciar
// el backend y no cuando un pasajero sube su primera foto.
func (d *DiskStore) CheckWritable(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	f, err := os.CreateTemp(d.root, ".write-check-*.tmp")
	if err != nil {
		return fmt.Errorf("%w (%s): %v", ErrNotWritable, d.root, err)
	}
	name := f.Name()
	defer os.Remove(name)
	if err := writeAndSync(f, []byte("ok")); err != nil {
		return fmt.Errorf("%w (%s): %v", ErrNotWritable, d.root, err)
	}
	if err := os.Remove(name); err != nil {
		return fmt.Errorf("%w (%s): no se pudo borrar el archivo de prueba: %v", ErrNotWritable, d.root, err)
	}
	return nil
}

// path convierte el nombre interno en la ruta del archivo. Además de validar el
// nombre (3d2), comprueba que la ruta final quede dentro de la carpeta raíz.
func (d *DiskStore) path(key string) (string, error) {
	if err := validateKey(key); err != nil {
		return "", err
	}
	p := filepath.Join(d.root, filepath.FromSlash(key))
	rel, err := filepath.Rel(d.root, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", attachment.ErrInvalidStorageKey
	}
	return p, nil
}

// Put guarda el archivo de forma atómica y sin sobrescribir nunca:
//
//  1. lo escribe en un temporal de la misma carpeta y lo fuerza a disco (fsync),
//  2. lo publica con su nombre final con un enlace duro (os.Link), que falla si
//     el nombre ya existe (a diferencia de rename, que sobrescribe),
//  3. borra el temporal.
//
// Si el proceso se cae a mitad, a lo más queda un temporal huérfano, nunca una
// imagen incompleta con su nombre final.
func (d *DiskStore) Put(ctx context.Context, key string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	final, err := d.path(key)
	if err != nil {
		return err
	}
	dir := filepath.Dir(final)
	if _, err := os.Lstat(final); err == nil {
		return ErrFileExists
	}

	tmp, err := createTemp(dir)
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // tras publicar, el nombre final sigue apuntando a los datos

	if err := writeAndSync(tmp, data); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, filePerm); err != nil {
		return fmt.Errorf("filestore: no se pudieron fijar los permisos: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.Link(tmpName, final); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return ErrFileExists
		}
		return fmt.Errorf("filestore: no se pudo publicar el archivo: %w", err)
	}
	syncDir(dir)
	return nil
}

// createTemp crea la carpeta del reclamo (si falta) y un temporal dentro. Si un
// Delete simultáneo borró la carpeta vacía justo entre ambos pasos, la vuelve a
// crear y reintenta. Una vez creado el temporal la carpeta ya no está vacía, así
// que Delete no puede borrarla mientras dura la subida.
func createTemp(dir string) (*os.File, error) {
	const attempts = 3
	var err error
	for i := 0; i < attempts; i++ {
		if err = os.MkdirAll(dir, dirPerm); err != nil {
			return nil, fmt.Errorf("filestore: no se pudo crear la carpeta del reclamo: %w", err)
		}
		var tmp *os.File
		if tmp, err = os.CreateTemp(dir, tempPattern); err == nil {
			return tmp, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			break
		}
	}
	return nil, fmt.Errorf("filestore: no se pudo crear el archivo temporal: %w", err)
}

// Delete borra la imagen y, si la carpeta de su reclamo queda vacía, también la
// carpeta. Como Open, solo borra archivos normales: una carpeta o un enlace
// simbólico con ese nombre se trata como inexistente.
func (d *DiskStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := d.path(key)
	if err != nil {
		return err
	}
	info, err := os.Lstat(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrFileNotFound
		}
		return fmt.Errorf("filestore: no se pudo leer el archivo: %w", err)
	}
	if !info.Mode().IsRegular() {
		return ErrFileNotFound
	}
	if err := os.Remove(p); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrFileNotFound
		}
		return fmt.Errorf("filestore: no se pudo borrar el archivo: %w", err)
	}
	dir := filepath.Dir(p)
	// Solo se borra si quedó vacía: os.Remove falla con una carpeta con archivos
	// (otras imágenes o una subida en curso), y ese error se ignora a propósito.
	_ = os.Remove(dir)
	syncDir(filepath.Dir(dir))
	return nil
}

// Open abre la imagen para leerla (por ejemplo, para enviarla en una descarga
// sin cargarla entera en memoria) y devuelve su tamaño. Quien llama debe
// cerrarla. Solo abre archivos normales: una carpeta o un enlace simbólico con
// ese nombre se trata como inexistente, para que un enlace nunca haga leer un
// archivo de fuera de la carpeta de imágenes.
func (d *DiskStore) Open(ctx context.Context, key string) (io.ReadCloser, int64, error) {
	if err := ctx.Err(); err != nil {
		return nil, 0, err
	}
	p, err := d.path(key)
	if err != nil {
		return nil, 0, err
	}
	info, err := os.Lstat(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, 0, ErrFileNotFound
		}
		return nil, 0, fmt.Errorf("filestore: no se pudo leer el archivo: %w", err)
	}
	if !info.Mode().IsRegular() {
		return nil, 0, ErrFileNotFound
	}
	f, err := os.Open(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, 0, ErrFileNotFound
		}
		return nil, 0, fmt.Errorf("filestore: no se pudo abrir el archivo: %w", err)
	}
	// El archivo abierto debe ser el mismo que se revisó: si entre la revisión y
	// la apertura lo reemplazaron (por ejemplo, por un enlace), no se entrega.
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		f.Close()
		return nil, 0, ErrFileNotFound
	}
	return f, opened.Size(), nil
}

// writeAndSync escribe todo, lo fuerza a disco y cierra el archivo.
func writeAndSync(f *os.File, data []byte) error {
	if _, err := f.Write(data); err != nil {
		f.Close()
		return fmt.Errorf("filestore: no se pudo escribir el archivo: %w", err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return fmt.Errorf("filestore: no se pudo guardar el archivo en disco: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("filestore: no se pudo cerrar el archivo: %w", err)
	}
	return nil
}

// syncDir fuerza a disco la entrada del archivo nuevo en su carpeta (Linux y
// macOS). En Windows no se puede sincronizar una carpeta; NTFS ya la registra.
func syncDir(dir string) {
	if runtime.GOOS == "windows" {
		return
	}
	if f, err := os.Open(dir); err == nil {
		_ = f.Sync()
		_ = f.Close()
	}
}
