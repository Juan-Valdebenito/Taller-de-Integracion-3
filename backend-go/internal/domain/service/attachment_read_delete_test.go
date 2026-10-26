package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// memAttachments: repositorio en memoria con búsqueda y borrado por reclamo,
// como el real (FindByID/Delete exigen el reclamo y el id).
type memAttachments struct {
	byID    map[string]domain.ComplaintAttachment
	listErr error
}

func (m *memAttachments) CountByComplaintID(context.Context, string) (int, error) { return 0, nil }

func (m *memAttachments) CreateWithinLimit(context.Context, domain.ComplaintAttachment) (*domain.ComplaintAttachment, error) {
	return nil, errors.New("no usado")
}

func (m *memAttachments) FindByComplaintID(_ context.Context, complaintID string) ([]domain.ComplaintAttachment, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	var out []domain.ComplaintAttachment
	for _, a := range m.byID {
		if a.ComplaintID == complaintID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (m *memAttachments) FindByID(_ context.Context, complaintID, id string) (*domain.ComplaintAttachment, error) {
	a, ok := m.byID[id]
	if !ok || a.ComplaintID != complaintID {
		return nil, nil
	}
	return &a, nil
}

func (m *memAttachments) Delete(_ context.Context, complaintID, id string) (*domain.ComplaintAttachment, error) {
	a, ok := m.byID[id]
	if !ok || a.ComplaintID != complaintID {
		return nil, repository.ErrAttachmentNotFound
	}
	delete(m.byID, id)
	return &a, nil
}

// withStoredImage deja una imagen guardada (archivo + registro) en comp-1.
func withStoredImage(t *testing.T) (*AttachmentService, *memAttachments, *filestore.MemoryStore, domain.ComplaintAttachment) {
	t.Helper()
	store := filestore.NewMemoryStore()
	key, err := attachment.NewStorageKey("comp-1", domain.MimeTypePNG)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), key, []byte("contenido de la imagen")); err != nil {
		t.Fatal(err)
	}
	att := domain.ComplaintAttachment{ID: "att-1", ComplaintID: "comp-1", StorageKey: key, MimeType: domain.MimeTypePNG, SizeBytes: 22}
	repo := &memAttachments{byID: map[string]domain.ComplaintAttachment{"att-1": att}}
	return NewAttachmentService(complaintsWith("comp-1", "comp-2"), repo, store), repo, store, att
}

func TestListReturnsTheComplaintImages(t *testing.T) {
	s, _, _, att := withStoredImage(t)
	for _, actor := range []domain.Actor{owner, admin} {
		list, err := s.List(context.Background(), actor, "comp-1")
		if err != nil || len(list) != 1 || list[0].ID != att.ID {
			t.Errorf("%+v: got %v, %v", actor, list, err)
		}
	}
	// Un reclamo sin imágenes devuelve lista vacía (no nil: el JSON será []).
	list, err := s.List(context.Background(), owner, "comp-2")
	if err != nil || list == nil || len(list) != 0 {
		t.Errorf("sin imágenes: got %#v, %v", list, err)
	}
}

func TestListHidesImagesFromOthers(t *testing.T) {
	s, _, _, _ := withStoredImage(t)
	for _, actor := range []domain.Actor{stranger, companyAc, {}} {
		if _, err := s.List(context.Background(), actor, "comp-1"); !errors.Is(err, ErrComplaintNotFound) {
			t.Errorf("%+v: want ErrComplaintNotFound, got %v", actor, err)
		}
	}
}

func TestListPropagatesDatabaseErrors(t *testing.T) {
	s, repo, _, _ := withStoredImage(t)
	repo.listErr = errors.New("base caída")
	if _, err := s.List(context.Background(), owner, "comp-1"); !errors.Is(err, repo.listErr) {
		t.Fatalf("want el error de la base, got %v", err)
	}
}

func TestOpenReturnsTheImageAndItsData(t *testing.T) {
	s, _, _, att := withStoredImage(t)
	for _, actor := range []domain.Actor{owner, admin} {
		got, file, err := s.Open(context.Background(), actor, "comp-1", "att-1")
		if err != nil {
			t.Fatalf("%+v: %v", actor, err)
		}
		data, _ := io.ReadAll(file)
		file.Close()
		if got.ID != att.ID || got.MimeType != domain.MimeTypePNG || string(data) != "contenido de la imagen" {
			t.Errorf("%+v: got %+v, %q", actor, got, data)
		}
	}
}

func TestOpenErrors(t *testing.T) {
	s, _, store, att := withStoredImage(t)
	ctx := context.Background()

	if _, _, err := s.Open(ctx, stranger, "comp-1", "att-1"); !errors.Is(err, ErrComplaintNotFound) {
		t.Errorf("otro pasajero: want ErrComplaintNotFound, got %v", err)
	}
	if _, _, err := s.Open(ctx, owner, "comp-1", "no-existe"); !errors.Is(err, ErrAttachmentNotFound) {
		t.Errorf("imagen inexistente: want ErrAttachmentNotFound, got %v", err)
	}
	// La imagen de comp-1 pedida desde comp-2 (del mismo dueño) no existe.
	if _, _, err := s.Open(ctx, owner, "comp-2", "att-1"); !errors.Is(err, ErrAttachmentNotFound) {
		t.Errorf("desde otro reclamo: want ErrAttachmentNotFound, got %v", err)
	}
	// Registro sin archivo (dato inconsistente): para el usuario, no hay imagen.
	if err := store.Delete(ctx, att.StorageKey); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Open(ctx, owner, "comp-1", "att-1"); !errors.Is(err, ErrAttachmentNotFound) {
		t.Errorf("archivo faltante: want ErrAttachmentNotFound, got %v", err)
	}
}

// Si el registro trajera un nombre interno manipulado (o de otro reclamo), no
// se abre ningún archivo.
func TestOpenRejectsTamperedStorageKeys(t *testing.T) {
	s, repo, _, att := withStoredImage(t)
	otherKey, _ := attachment.NewStorageKey("comp-2", domain.MimeTypePNG)
	for _, key := range []string{"complaints/comp-1/../../etc/passwd", otherKey} {
		tampered := att
		tampered.StorageKey = key
		repo.byID["att-1"] = tampered
		_, file, err := s.Open(context.Background(), owner, "comp-1", "att-1")
		if file != nil {
			file.Close()
		}
		if !errors.Is(err, attachment.ErrInvalidStorageKey) {
			t.Errorf("%q: want ErrInvalidStorageKey, got %v", key, err)
		}
	}
}

func TestDeleteRemovesRecordAndFile(t *testing.T) {
	for _, actor := range []domain.Actor{owner, admin} {
		s, repo, store, _ := withStoredImage(t)
		if err := s.Delete(context.Background(), actor, "comp-1", "att-1"); err != nil {
			t.Fatalf("%+v: %v", actor, err)
		}
		if len(repo.byID) != 0 || store.Len() != 0 {
			t.Errorf("%+v: deben borrarse el registro y el archivo (quedan %d y %d)", actor, len(repo.byID), store.Len())
		}
	}
}

func TestDeleteErrors(t *testing.T) {
	s, repo, store, _ := withStoredImage(t)
	ctx := context.Background()

	if err := s.Delete(ctx, stranger, "comp-1", "att-1"); !errors.Is(err, ErrComplaintNotFound) {
		t.Errorf("otro pasajero: want ErrComplaintNotFound, got %v", err)
	}
	if err := s.Delete(ctx, owner, "comp-2", "att-1"); !errors.Is(err, ErrAttachmentNotFound) {
		t.Errorf("desde otro reclamo: want ErrAttachmentNotFound, got %v", err)
	}
	if err := s.Delete(ctx, owner, "comp-1", "no-existe"); !errors.Is(err, ErrAttachmentNotFound) {
		t.Errorf("inexistente: want ErrAttachmentNotFound, got %v", err)
	}
	if len(repo.byID) != 1 || store.Len() != 1 {
		t.Fatal("los intentos fallidos no deben borrar nada")
	}
}

// Si el archivo ya no estaba, borrar igual funciona (el registro se borra).
func TestDeleteWhenTheFileIsAlreadyMissing(t *testing.T) {
	s, repo, store, att := withStoredImage(t)
	_ = store.Delete(context.Background(), att.StorageKey)
	if err := s.Delete(context.Background(), owner, "comp-1", "att-1"); err != nil {
		t.Fatalf("debe borrar el registro aunque falte el archivo: %v", err)
	}
	if len(repo.byID) != 0 {
		t.Fatal("el registro debe borrarse")
	}
}

// Un registro con nombre interno de otro reclamo no borra el archivo ajeno.
func TestDeleteNeverRemovesAnotherComplaintsFile(t *testing.T) {
	s, repo, store, att := withStoredImage(t)
	otherKey, _ := attachment.NewStorageKey("comp-2", domain.MimeTypePNG)
	if err := store.Put(context.Background(), otherKey, []byte("imagen de otro reclamo")); err != nil {
		t.Fatal(err)
	}
	tampered := att
	tampered.StorageKey = otherKey
	repo.byID["att-1"] = tampered

	if err := s.Delete(context.Background(), owner, "comp-1", "att-1"); err != nil {
		t.Fatal(err)
	}
	r, _, err := store.Open(context.Background(), otherKey)
	if err != nil {
		t.Fatalf("el archivo del otro reclamo no debe borrarse: %v", err)
	}
	data, _ := io.ReadAll(r)
	r.Close()
	if !bytes.Equal(data, []byte("imagen de otro reclamo")) {
		t.Fatalf("contenido alterado: %q", data)
	}
}

func TestOpenAndDeleteWithoutStorage(t *testing.T) {
	s := NewAttachmentService(complaintsWith("comp-1"), &memAttachments{}, nil)
	if _, _, err := s.Open(context.Background(), owner, "comp-1", "att-1"); !errors.Is(err, ErrAttachmentStorageUnavailable) {
		t.Errorf("Open: want ErrAttachmentStorageUnavailable, got %v", err)
	}
	if err := s.Delete(context.Background(), owner, "comp-1", "att-1"); !errors.Is(err, ErrAttachmentStorageUnavailable) {
		t.Errorf("Delete: want ErrAttachmentStorageUnavailable, got %v", err)
	}
	// Listar solo usa la base: funciona aunque falte el almacenamiento.
	if list, err := s.List(context.Background(), owner, "comp-1"); err != nil || list == nil {
		t.Errorf("List sin almacenamiento: %v, %v", list, err)
	}
}

// Los mensajes de error no exponen la ruta interna del archivo.
func TestErrorsDoNotLeakStorageKeys(t *testing.T) {
	for _, err := range []error{ErrAttachmentNotFound, ErrComplaintNotFound, ErrAttachmentForbidden, ErrAttachmentStorageUnavailable} {
		if strings.Contains(err.Error(), "complaints/") {
			t.Errorf("el mensaje %q no debe contener rutas internas", err)
		}
	}
}
