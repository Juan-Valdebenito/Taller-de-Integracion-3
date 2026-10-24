package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// fakeAttachments: repositorio de imágenes en memoria. createErr simula fallos
// al registrar (base caída, imagen duplicada, límite alcanzado por otra subida).
type fakeAttachments struct {
	saved     []domain.ComplaintAttachment
	count     int
	createErr error
	onCreate  func() // se ejecuta al registrar (ej. cancelar la petición)
}

func (f *fakeAttachments) CountByComplaintID(context.Context, string) (int, error) {
	return f.count, nil
}

func (f *fakeAttachments) CreateWithinLimit(_ context.Context, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	if f.onCreate != nil {
		f.onCreate()
	}
	if f.createErr != nil {
		return nil, f.createErr
	}
	if err := att.Validate(); err != nil {
		return nil, err
	}
	att.ID = "att-1"
	att.CreatedAt = time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	f.saved = append(f.saved, att)
	return &att, nil
}

func (f *fakeAttachments) FindByComplaintID(context.Context, string) ([]domain.ComplaintAttachment, error) {
	return f.saved, nil
}

func (f *fakeAttachments) FindByID(context.Context, string, string) (*domain.ComplaintAttachment, error) {
	return nil, nil
}

func (f *fakeAttachments) Delete(context.Context, string, string) (*domain.ComplaintAttachment, error) {
	return nil, repository.ErrAttachmentNotFound
}

// mustNotRead falla el test si se intenta leer la foto.
type mustNotRead struct{ t *testing.T }

func (m mustNotRead) Read([]byte) (int, error) {
	m.t.Fatal("no se debe leer la foto")
	return 0, io.EOF
}

func photo(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 64, 48))
	for y := 0; y < 48; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x * 4), G: uint8(y * 5), B: 90, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func newUploadService(repo *fakeAttachments) (*AttachmentService, *filestore.MemoryStore) {
	store := filestore.NewMemoryStore()
	return NewAttachmentService(complaintsWith("comp-1"), repo, store), store
}

func TestUploadSavesFileAndRecord(t *testing.T) {
	repo := &fakeAttachments{}
	s, store := newUploadService(repo)

	saved, err := s.Upload(context.Background(), owner, "comp-1", bytes.NewReader(photo(t)),
		`[{"x":0.25,"y":0.25,"width":0.5,"height":0.5}]`)
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID != "att-1" || saved.ComplaintID != "comp-1" || saved.MaskedRegions != 1 ||
		saved.UploadedBy == nil || *saved.UploadedBy != owner.UserID || saved.MimeType != domain.MimeTypePNG {
		t.Fatalf("registro inesperado: %+v", saved)
	}
	// El archivo guardado es exactamente el que describe el registro.
	if err := attachment.ValidateStorageKeyFor(saved.StorageKey, "comp-1"); err != nil {
		t.Fatalf("nombre interno inválido: %v", err)
	}
	r, size, err := store.Open(context.Background(), saved.StorageKey)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	data, _ := io.ReadAll(r)
	sum := sha256.Sum256(data)
	if size != saved.SizeBytes || hex.EncodeToString(sum[:]) != saved.SHA256 {
		t.Fatalf("el archivo guardado no coincide con el registro (%d bytes vs %d)", size, saved.SizeBytes)
	}
}

// Sin permiso, o con el reclamo lleno, se rechaza sin leer la foto ni guardar nada.
func TestUploadRejectsBeforeReadingThePhoto(t *testing.T) {
	cases := []struct {
		name  string
		actor domain.Actor
		count int
		want  error
	}{
		{"otro pasajero", stranger, 0, ErrComplaintNotFound},
		{"administrador", admin, 0, ErrAttachmentForbidden},
		{"sin sesión", domain.Actor{}, 0, ErrComplaintNotFound},
		{"reclamo con el máximo de imágenes", owner, domain.MaxAttachmentsPerComplaint, domain.ErrAttachmentLimitReached},
	}
	for _, tc := range cases {
		repo := &fakeAttachments{count: tc.count}
		s, store := newUploadService(repo)
		saved, err := s.Upload(context.Background(), tc.actor, "comp-1", mustNotRead{t}, "")
		if !errors.Is(err, tc.want) || saved != nil {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, err)
		}
		if store.Len() != 0 || len(repo.saved) != 0 {
			t.Errorf("%s: no debe guardarse nada", tc.name)
		}
	}
}

// Un archivo inválido no deja nada guardado y su error es del cliente (4xx).
func TestUploadRejectsInvalidFiles(t *testing.T) {
	repo := &fakeAttachments{}
	s, store := newUploadService(repo)
	_, err := s.Upload(context.Background(), owner, "comp-1", bytes.NewReader([]byte("no es una imagen")), "")
	if !errors.Is(err, domain.ErrAttachmentUnsupportedType) || !attachment.IsClientError(err) {
		t.Fatalf("want ErrAttachmentUnsupportedType (cliente), got %v", err)
	}
	if store.Len() != 0 || len(repo.saved) != 0 {
		t.Fatal("no debe guardarse nada")
	}
}

// Si registrar en la base falla, el archivo ya guardado se borra: no quedan
// archivos sin registro. El error original se conserva.
func TestUploadRemovesTheFileWhenTheRecordFails(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{"base de datos caída", errors.New("conexión perdida")},
		{"imagen duplicada en el reclamo", repository.ErrAttachmentDuplicate},
		{"otra subida llenó el reclamo", domain.ErrAttachmentLimitReached},
		{"reclamo borrado mientras se subía", repository.ErrAttachmentComplaintNotFound},
	}
	for _, tc := range cases {
		repo := &fakeAttachments{createErr: tc.err}
		s, store := newUploadService(repo)
		saved, err := s.Upload(context.Background(), owner, "comp-1", bytes.NewReader(photo(t)), "")
		if !errors.Is(err, tc.err) || saved != nil {
			t.Errorf("%s: want %v, got %v", tc.name, tc.err, err)
		}
		if store.Len() != 0 {
			t.Errorf("%s: el archivo sin registro debe borrarse (quedan %d)", tc.name, store.Len())
		}
	}
}

// La limpieza se hace aunque la petición se cancele justo al registrar (el
// usuario cerró la app a mitad de la subida).
func TestUploadCleansUpEvenIfTheRequestIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	repo := &fakeAttachments{onCreate: cancel, createErr: context.Canceled}
	s, store := newUploadService(repo)

	_, err := s.Upload(ctx, owner, "comp-1", bytes.NewReader(photo(t)), "")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	if store.Len() != 0 {
		t.Fatal("el archivo debe borrarse aunque la petición se haya cancelado")
	}
}

func TestUploadWithoutStorage(t *testing.T) {
	s := NewAttachmentService(complaintsWith("comp-1"), &fakeAttachments{}, nil)
	if _, err := s.Upload(context.Background(), owner, "comp-1", mustNotRead{t}, ""); !errors.Is(err, ErrAttachmentStorageUnavailable) {
		t.Fatalf("want ErrAttachmentStorageUnavailable, got %v", err)
	}
}
