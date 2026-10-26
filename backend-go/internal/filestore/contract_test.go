package filestore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// testStoreContract son las pruebas que debe pasar toda implementación de Store
// (en memoria y, en la 5b/5c, en disco): así se comportan exactamente igual.
func testStoreContract(t *testing.T, newStore func(t *testing.T) Store) {
	ctx := context.Background()

	t.Run("guarda y vuelve a leer el archivo", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		data := []byte("\xff\xd8\xff contenido de la imagen")
		if err := s.Put(ctx, key, data); err != nil {
			t.Fatal(err)
		}
		got, size := readAll(t, s, key)
		if !bytes.Equal(got, data) || size != int64(len(data)) {
			t.Fatalf("got %q (%d bytes), want %q", got, size, data)
		}
	})

	t.Run("nunca sobrescribe un archivo existente", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		if err := s.Put(ctx, key, []byte("original")); err != nil {
			t.Fatal(err)
		}
		if err := s.Put(ctx, key, []byte("otro")); !errors.Is(err, ErrFileExists) {
			t.Fatalf("want ErrFileExists, got %v", err)
		}
		if got, _ := readAll(t, s, key); string(got) != "original" {
			t.Fatalf("el archivo original cambió: %q", got)
		}
	})

	t.Run("abrir o borrar un archivo que no existe", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		if _, _, err := s.Open(ctx, key); !errors.Is(err, ErrFileNotFound) {
			t.Errorf("Open: want ErrFileNotFound, got %v", err)
		}
		if err := s.Delete(ctx, key); !errors.Is(err, ErrFileNotFound) {
			t.Errorf("Delete: want ErrFileNotFound, got %v", err)
		}
	})

	t.Run("borrar elimina el archivo", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		if err := s.Put(ctx, key, []byte("x")); err != nil {
			t.Fatal(err)
		}
		if err := s.Delete(ctx, key); err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.Open(ctx, key); !errors.Is(err, ErrFileNotFound) {
			t.Fatalf("después de borrar: want ErrFileNotFound, got %v", err)
		}
		if err := s.Delete(ctx, key); !errors.Is(err, ErrFileNotFound) {
			t.Fatalf("borrar dos veces: want ErrFileNotFound, got %v", err)
		}
	})

	t.Run("archivos de distintos reclamos no se mezclan", func(t *testing.T) {
		s := newStore(t)
		a, b := newKey(t, "comp-1"), newKey(t, "comp-2")
		if err := s.Put(ctx, a, []byte("del reclamo 1")); err != nil {
			t.Fatal(err)
		}
		if err := s.Put(ctx, b, []byte("del reclamo 2")); err != nil {
			t.Fatal(err)
		}
		if err := s.Delete(ctx, a); err != nil {
			t.Fatal(err)
		}
		if got, _ := readAll(t, s, b); string(got) != "del reclamo 2" {
			t.Fatalf("borrar un archivo no debe afectar a otro: %q", got)
		}
	})

	t.Run("cambiar los datos después de guardarlos no altera el archivo", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		data := []byte("original")
		if err := s.Put(ctx, key, data); err != nil {
			t.Fatal(err)
		}
		copy(data, "XXXXXXXX")
		if got, _ := readAll(t, s, key); string(got) != "original" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("rechaza nombres internos manipulados sin tocar el almacenamiento", func(t *testing.T) {
		s := newStore(t)
		token := strings.Repeat("ab", 16)
		for _, key := range []string{
			"",
			"complaints/c1/../../etc/passwd",
			"/complaints/c1/" + token + ".jpg",
			`complaints\c1\` + token + ".jpg",
			"complaints/c1/" + token + ".jpg.php",
			"otra/carpeta/" + token + ".jpg",
		} {
			if err := s.Put(ctx, key, []byte("x")); !errors.Is(err, attachment.ErrInvalidStorageKey) {
				t.Errorf("Put %q: want ErrInvalidStorageKey, got %v", key, err)
			}
			if _, _, err := s.Open(ctx, key); !errors.Is(err, attachment.ErrInvalidStorageKey) {
				t.Errorf("Open %q: want ErrInvalidStorageKey, got %v", key, err)
			}
			if err := s.Delete(ctx, key); !errors.Is(err, attachment.ErrInvalidStorageKey) {
				t.Errorf("Delete %q: want ErrInvalidStorageKey, got %v", key, err)
			}
		}
	})

	t.Run("respeta un contexto cancelado", func(t *testing.T) {
		s := newStore(t)
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		key := newKey(t, "comp-1")
		if err := s.Put(cancelled, key, []byte("x")); !errors.Is(err, context.Canceled) {
			t.Errorf("Put: want context.Canceled, got %v", err)
		}
		if _, _, err := s.Open(cancelled, key); !errors.Is(err, context.Canceled) {
			t.Errorf("Open: want context.Canceled, got %v", err)
		}
		if err := s.Delete(cancelled, key); !errors.Is(err, context.Canceled) {
			t.Errorf("Delete: want context.Canceled, got %v", err)
		}
	})

	t.Run("guardar el mismo nombre al mismo tiempo: solo uno gana", func(t *testing.T) {
		s := newStore(t)
		key := newKey(t, "comp-1")
		const writers = 8
		var wg sync.WaitGroup
		errs := make(chan error, writers)
		for i := 0; i < writers; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				errs <- s.Put(ctx, key, []byte(fmt.Sprintf("version %d", i)))
			}(i)
		}
		wg.Wait()
		close(errs)
		ok := 0
		for err := range errs {
			switch {
			case err == nil:
				ok++
			case !errors.Is(err, ErrFileExists):
				t.Errorf("error inesperado: %v", err)
			}
		}
		if ok != 1 {
			t.Fatalf("exactamente un Put debe ganar, ganaron %d", ok)
		}
	})
}

func newKey(t *testing.T, complaintID string) string {
	t.Helper()
	key, err := attachment.NewStorageKey(complaintID, domain.MimeTypeJPEG)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func readAll(t *testing.T, s Store, key string) ([]byte, int64) {
	t.Helper()
	r, size, err := s.Open(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return data, size
}
