package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
)

// ComplaintFinder busca reclamos (lo implementa repository.ComplaintRepository).
type ComplaintFinder interface {
	FindByID(ctx context.Context, id string) (*domain.Complaint, error)
}

// AttachmentRepository guarda los metadatos de las imágenes (lo implementa
// repository.ComplaintAttachmentRepository).
type AttachmentRepository interface {
	CountByComplaintID(ctx context.Context, complaintID string) (int, error)
	CreateWithinLimit(ctx context.Context, att domain.ComplaintAttachment) (*domain.ComplaintAttachment, error)
	FindByComplaintID(ctx context.Context, complaintID string) ([]domain.ComplaintAttachment, error)
	FindByID(ctx context.Context, complaintID, id string) (*domain.ComplaintAttachment, error)
	Delete(ctx context.Context, complaintID, id string) (*domain.ComplaintAttachment, error)
}

var (
	// ErrComplaintNotFound: el reclamo no existe, o el usuario no puede ver sus
	// imágenes (no se revela que existe).
	ErrComplaintNotFound = errors.New("reclamo no encontrado")
	// ErrAttachmentForbidden: el usuario puede ver las imágenes del reclamo, pero
	// no hacer esta acción (ej. un administrador intentando subir una foto).
	ErrAttachmentForbidden = errors.New("no tienes permiso para realizar esta acción con las imágenes del reclamo")
)

// AttachmentService une todo lo necesario para las imágenes de reclamos:
// permisos, procesamiento (paquete attachment), archivos (filestore) y
// metadatos (repositorio). Los endpoints solo lo llaman.
type AttachmentService struct {
	complaints ComplaintFinder
	repo       AttachmentRepository
	store      filestore.Store
}

func NewAttachmentService(complaints ComplaintFinder, repo AttachmentRepository, store filestore.Store) *AttachmentService {
	return &AttachmentService{complaints: complaints, repo: repo, store: store}
}

// authorize busca el reclamo y comprueba el permiso pedido (allowed):
//
//   - si no existe, o el usuario ni siquiera puede ver sus imágenes →
//     ErrComplaintNotFound (así no se revela que el reclamo existe);
//   - si puede verlas pero no hacer esta acción → ErrAttachmentForbidden.
func (s *AttachmentService) authorize(
	ctx context.Context,
	complaintID string,
	actor domain.Actor,
	allowed func(*domain.Complaint, domain.Actor) bool,
) (*domain.Complaint, error) {
	complaint, err := s.complaints.FindByID(ctx, complaintID)
	if err != nil {
		return nil, fmt.Errorf("AttachmentService: buscando el reclamo: %w", err)
	}
	if complaint == nil || !domain.CanViewAttachments(complaint, actor) {
		return nil, ErrComplaintNotFound
	}
	if !allowed(complaint, actor) {
		return nil, ErrAttachmentForbidden
	}
	return complaint, nil
}
