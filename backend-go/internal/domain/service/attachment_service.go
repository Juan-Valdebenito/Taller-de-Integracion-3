package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
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
	// ErrAttachmentStorageUnavailable: el almacenamiento de imágenes no está
	// disponible (ver ATTACHMENTS_DIR); la API responde 503.
	ErrAttachmentStorageUnavailable = errors.New("el almacenamiento de imágenes no está disponible en este momento")
	// ErrAttachmentNotFound: la imagen no existe en ese reclamo.
	ErrAttachmentNotFound = errors.New("imagen no encontrada")
)

// cleanupTimeout limita cuánto se espera al borrar un archivo que quedó sin registrar.
const cleanupTimeout = 10 * time.Second

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

// Upload procesa y guarda una imagen subida por el pasajero dueño del reclamo:
//
//  1. permiso para subir (si no, la foto ni se lee),
//  2. cuántas imágenes tiene ya el reclamo,
//  3. attachment.ProcessUpload: zonas, validación, sanitización y pixelado,
//  4. nombre interno aleatorio,
//  5. guardar el archivo,
//  6. registrar los datos en la base, con el máximo por reclamo bajo bloqueo.
//
// Si el paso 6 falla, el archivo del paso 5 se borra: no quedan archivos sin
// registro. Los errores del archivo o de las zonas se reconocen con
// attachment.IsClientError (respuesta 4xx).
func (s *AttachmentService) Upload(
	ctx context.Context,
	actor domain.Actor,
	complaintID string,
	file io.Reader,
	maskRegionsJSON string,
) (*domain.ComplaintAttachment, error) {
	if s.store == nil {
		return nil, ErrAttachmentStorageUnavailable
	}
	complaint, err := s.authorize(ctx, complaintID, actor, domain.CanUploadAttachment)
	if err != nil {
		return nil, err
	}
	current, err := s.repo.CountByComplaintID(ctx, complaint.ID)
	if err != nil {
		return nil, fmt.Errorf("AttachmentService.Upload: contando imágenes: %w", err)
	}
	image, err := attachment.ProcessUpload(file, current, maskRegionsJSON)
	if err != nil {
		return nil, err
	}
	key, err := attachment.NewStorageKey(complaint.ID, image.MimeType)
	if err != nil {
		return nil, fmt.Errorf("AttachmentService.Upload: %w", err)
	}
	if err := s.store.Put(ctx, key, image.Data); err != nil {
		return nil, fmt.Errorf("AttachmentService.Upload: guardando el archivo: %w", err)
	}

	uploader := actor.UserID
	saved, err := s.repo.CreateWithinLimit(ctx, image.ToAttachment(complaint.ID, key, &uploader))
	if err != nil {
		if cleanupErr := s.removeOrphan(ctx, key); cleanupErr != nil {
			return nil, fmt.Errorf("%w (además no se pudo borrar el archivo sin registrar %s: %v)", err, key, cleanupErr)
		}
		return nil, err
	}
	return saved, nil
}

// List devuelve las imágenes del reclamo en orden de subida (lista vacía si no
// tiene). Pueden verlas el dueño y los administradores.
func (s *AttachmentService) List(ctx context.Context, actor domain.Actor, complaintID string) ([]domain.ComplaintAttachment, error) {
	complaint, err := s.authorize(ctx, complaintID, actor, domain.CanViewAttachments)
	if err != nil {
		return nil, err
	}
	attachments, err := s.repo.FindByComplaintID(ctx, complaint.ID)
	if err != nil {
		return nil, fmt.Errorf("AttachmentService.List: %w", err)
	}
	if attachments == nil {
		attachments = []domain.ComplaintAttachment{}
	}
	return attachments, nil
}

// Open abre una imagen del reclamo para descargarla y devuelve también sus
// datos (tipo, tamaño). Quien llama debe cerrar el archivo.
func (s *AttachmentService) Open(ctx context.Context, actor domain.Actor, complaintID, attachmentID string) (*domain.ComplaintAttachment, io.ReadCloser, error) {
	if s.store == nil {
		return nil, nil, ErrAttachmentStorageUnavailable
	}
	complaint, err := s.authorize(ctx, complaintID, actor, domain.CanViewAttachments)
	if err != nil {
		return nil, nil, err
	}
	att, err := s.repo.FindByID(ctx, complaint.ID, attachmentID)
	if err != nil {
		return nil, nil, fmt.Errorf("AttachmentService.Open: %w", err)
	}
	if att == nil {
		return nil, nil, ErrAttachmentNotFound
	}
	// Defensa adicional: el nombre interno debe ser válido y de este reclamo.
	if err := attachment.ValidateStorageKeyFor(att.StorageKey, complaint.ID); err != nil {
		return nil, nil, fmt.Errorf("AttachmentService.Open: imagen %s: %w", att.ID, err)
	}
	file, _, err := s.store.Open(ctx, att.StorageKey)
	if err != nil {
		if errors.Is(err, filestore.ErrFileNotFound) {
			// El registro existe pero el archivo no: para el usuario, no hay imagen.
			return nil, nil, ErrAttachmentNotFound
		}
		return nil, nil, fmt.Errorf("AttachmentService.Open: %w", err)
	}
	return att, file, nil
}

// Delete borra una imagen del reclamo (el dueño o un administrador). Primero
// borra el registro y después el archivo: si el archivo no se pudiera borrar,
// queda un archivo suelto e inalcanzable (inofensivo), en vez de un registro
// que apunta a un archivo inexistente.
func (s *AttachmentService) Delete(ctx context.Context, actor domain.Actor, complaintID, attachmentID string) error {
	if s.store == nil {
		return ErrAttachmentStorageUnavailable
	}
	complaint, err := s.authorize(ctx, complaintID, actor, domain.CanDeleteAttachment)
	if err != nil {
		return err
	}
	deleted, err := s.repo.Delete(ctx, complaint.ID, attachmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAttachmentNotFound) {
			return ErrAttachmentNotFound
		}
		return fmt.Errorf("AttachmentService.Delete: %w", err)
	}
	// Solo se toca el archivo si su nombre interno es válido y de este reclamo.
	if attachment.ValidateStorageKeyFor(deleted.StorageKey, complaint.ID) == nil {
		_ = s.removeOrphan(ctx, deleted.StorageKey)
	}
	return nil
}

// removeOrphan borra un archivo que ya no tiene registro en la base: el de una
// subida que no se pudo registrar, o el de una imagen recién borrada. Se hace
// aunque la petición se haya cancelado (ej. el usuario cerró la app a mitad):
// por eso usa un contexto propio con tiempo límite. Si el archivo ya no existe,
// no es un error.
func (s *AttachmentService) removeOrphan(ctx context.Context, key string) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), cleanupTimeout)
	defer cancel()
	if err := s.store.Delete(cleanupCtx, key); err != nil && !errors.Is(err, filestore.ErrFileNotFound) {
		return err
	}
	return nil
}
