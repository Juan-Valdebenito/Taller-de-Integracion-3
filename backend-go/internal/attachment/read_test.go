package attachment

import (
	"bytes"
	"errors"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// endless entrega bytes sin fin y cuenta cuántos se le pidieron.
type endless struct{ read int64 }

func (e *endless) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'x'
	}
	e.read += int64(len(p))
	return len(p), nil
}

// failing simula una conexión que se corta a mitad de la subida.
type failing struct{}

func (failing) Read([]byte) (int, error) { return 0, errors.New("connection reset by peer") }

func TestReadLimitedReturnsTheFile(t *testing.T) {
	want := []byte("\xff\xd8\xff contenido de la imagen")
	got, err := ReadLimited(bytes.NewReader(want))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestReadLimitedSizeBoundaries(t *testing.T) {
	cases := []struct {
		name string
		size int64
		want error
	}{
		{"vacío", 0, domain.ErrAttachmentEmpty},
		{"1 byte", 1, nil},
		{"exactamente 5 MB", domain.MaxAttachmentSizeBytes, nil},
		{"5 MB + 1 byte", domain.MaxAttachmentSizeBytes + 1, domain.ErrAttachmentTooLarge},
	}
	for _, tc := range cases {
		data, err := ReadLimited(bytes.NewReader(make([]byte, tc.size)))
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, err)
		}
		if tc.want == nil && int64(len(data)) != tc.size {
			t.Errorf("%s: se leyeron %d bytes, se esperaban %d", tc.name, len(data), tc.size)
		}
		if tc.want != nil && data != nil {
			t.Errorf("%s: ante un error no debe devolver datos", tc.name)
		}
	}
}

// Un archivo gigante (o un flujo sin fin) se corta justo después del límite.
func TestReadLimitedStopsReadingAfterTheLimit(t *testing.T) {
	src := &endless{}
	_, err := ReadLimited(src)
	if !errors.Is(err, domain.ErrAttachmentTooLarge) {
		t.Fatalf("want ErrAttachmentTooLarge, got %v", err)
	}
	// io.ReadAll pide en bloques: se tolera el último bloque, pero nunca leer
	// mucho más allá del límite (ej. 1 GB).
	if limit := domain.MaxAttachmentSizeBytes + 1; src.read > 2*limit {
		t.Fatalf("se leyeron %d bytes; no debe leer mucho más que %d", src.read, limit)
	}
}

func TestReadLimitedReadError(t *testing.T) {
	_, err := ReadLimited(failing{})
	if !errors.Is(err, ErrAttachmentRead) {
		t.Fatalf("want ErrAttachmentRead, got %v", err)
	}
	// El error conserva el detalle técnico para los logs; la API identificará el
	// caso con errors.Is y mostrará al usuario solo el mensaje de ErrAttachmentRead.
	if got := err.Error(); got != "no se pudo leer la imagen enviada: connection reset by peer" {
		t.Fatalf("mensaje inesperado: %q", got)
	}
}
