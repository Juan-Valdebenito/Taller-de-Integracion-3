package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
)

// Al eliminar un reclamo se borran los archivos de sus imágenes, no solo los
// registros (antes quedaban guardados en el servidor).

func TestDeleteComplaintRemovesItsFiles(t *testing.T) {
	s, repo, store, att := withStoredImage(t)
	deleted := false
	left, err := s.DeleteComplaintWithFiles(context.Background(), "comp-1", func(context.Context) error {
		deleted = true
		// La cascada de la base borra los registros de las imágenes.
		delete(repo.byID, att.ID)
		return nil
	})
	if err != nil || left != 0 || !deleted {
		t.Fatalf("got left=%d err=%v deleted=%v", left, err, deleted)
	}
	if _, _, err := store.Open(context.Background(), att.StorageKey); !errors.Is(err, filestore.ErrFileNotFound) {
		t.Errorf("el archivo debía borrarse: %v", err)
	}
}

func TestDeleteComplaintKeepsFilesIfTheComplaintIsNotDeleted(t *testing.T) {
	s, _, store, att := withStoredImage(t)
	boom := errors.New("no se pudo borrar")
	if _, err := s.DeleteComplaintWithFiles(context.Background(), "comp-1", func(context.Context) error { return boom }); !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
	if rc, _, err := store.Open(context.Background(), att.StorageKey); err != nil {
		t.Errorf("el archivo no debía tocarse: %v", err)
	} else {
		_ = rc.Close()
	}
}

func TestDeleteComplaintDoesNotDeleteIfListingFails(t *testing.T) {
	s, repo, _, _ := withStoredImage(t)
	repo.listErr = errors.New("base caída")
	called := false
	if _, err := s.DeleteComplaintWithFiles(context.Background(), "comp-1", func(context.Context) error { called = true; return nil }); !errors.Is(err, repo.listErr) {
		t.Fatalf("got %v", err)
	}
	if called {
		t.Error("sin la lista de archivos no se debe borrar el reclamo")
	}
}

// Un nombre interno que no es de este reclamo no se toca y se cuenta como pendiente.
func TestDeleteComplaintSkipsForeignStorageKeys(t *testing.T) {
	store := filestore.NewMemoryStore()
	foreignKey, err := attachment.NewStorageKey("otro-reclamo", domain.MimeTypePNG)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), foreignKey, []byte("ajeno")); err != nil {
		t.Fatal(err)
	}
	repo := &memAttachments{byID: map[string]domain.ComplaintAttachment{
		"att-x": {ID: "att-x", ComplaintID: "comp-1", StorageKey: foreignKey, MimeType: domain.MimeTypePNG},
	}}
	s := NewAttachmentService(complaintsWith("comp-1"), repo, store)

	left, err := s.DeleteComplaintWithFiles(context.Background(), "comp-1", func(context.Context) error { return nil })
	if err != nil || left != 1 {
		t.Fatalf("got left=%d err=%v", left, err)
	}
	if rc, _, err := store.Open(context.Background(), foreignKey); err != nil {
		t.Errorf("el archivo ajeno no debía borrarse: %v", err)
	} else {
		_ = rc.Close()
	}
}
