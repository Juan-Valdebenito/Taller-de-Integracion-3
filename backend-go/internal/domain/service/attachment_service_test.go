package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// Los repositorios reales cumplen las interfaces que usa el servicio.
var (
	_ ComplaintFinder      = (*repository.ComplaintRepository)(nil)
	_ AttachmentRepository = (*repository.ComplaintAttachmentRepository)(nil)
)

// fakeComplaints: reclamos en memoria (o un error, para simular la base caída).
type fakeComplaints struct {
	byID map[string]*domain.Complaint
	err  error
}

func (f *fakeComplaints) FindByID(_ context.Context, id string) (*domain.Complaint, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.byID[id], nil
}

var (
	owner     = domain.Actor{UserID: "usr-pass-01", Role: domain.UserRolePassenger}
	stranger  = domain.Actor{UserID: "usr-pass-02", Role: domain.UserRolePassenger}
	admin     = domain.Actor{UserID: "usr-admin-01", Role: domain.UserRoleAdmin}
	companyAc = domain.Actor{UserID: "usr-comp-01", Role: domain.UserRoleCompany}
)

func complaintsWith(ids ...string) *fakeComplaints {
	byID := map[string]*domain.Complaint{}
	for _, id := range ids {
		passenger := owner.UserID
		byID[id] = &domain.Complaint{ID: id, PassengerID: &passenger}
	}
	return &fakeComplaints{byID: byID}
}

func TestAuthorizeAllowsTheOwner(t *testing.T) {
	s := NewAttachmentService(complaintsWith("comp-1"), nil, filestore.NewMemoryStore())
	c, err := s.authorize(context.Background(), "comp-1", owner, domain.CanUploadAttachment)
	if err != nil || c == nil || c.ID != "comp-1" {
		t.Fatalf("el dueño debe poder subir: %v, %v", c, err)
	}
}

// Quien no puede ver las imágenes recibe "no encontrado": no se revela que el
// reclamo existe (mismo error que si no existiera).
func TestAuthorizeHidesComplaintsFromOthers(t *testing.T) {
	s := NewAttachmentService(complaintsWith("comp-1"), nil, filestore.NewMemoryStore())
	ctx := context.Background()

	for _, actor := range []domain.Actor{stranger, companyAc, {}} {
		for name, rule := range map[string]func(*domain.Complaint, domain.Actor) bool{
			"subir": domain.CanUploadAttachment, "ver": domain.CanViewAttachments, "borrar": domain.CanDeleteAttachment,
		} {
			if _, err := s.authorize(ctx, "comp-1", actor, rule); !errors.Is(err, ErrComplaintNotFound) {
				t.Errorf("%+v %s: want ErrComplaintNotFound, got %v", actor, name, err)
			}
		}
	}
	if _, err := s.authorize(ctx, "no-existe", owner, domain.CanViewAttachments); !errors.Is(err, ErrComplaintNotFound) {
		t.Errorf("reclamo inexistente: want ErrComplaintNotFound, got %v", err)
	}
}

// Un administrador ve el reclamo, pero no puede subir fotos en nombre del pasajero.
func TestAuthorizeForbidsActionsTheUserCannotDo(t *testing.T) {
	s := NewAttachmentService(complaintsWith("comp-1"), nil, filestore.NewMemoryStore())
	ctx := context.Background()

	if _, err := s.authorize(ctx, "comp-1", admin, domain.CanUploadAttachment); !errors.Is(err, ErrAttachmentForbidden) {
		t.Errorf("admin subiendo: want ErrAttachmentForbidden, got %v", err)
	}
	if _, err := s.authorize(ctx, "comp-1", admin, domain.CanViewAttachments); err != nil {
		t.Errorf("admin viendo: %v", err)
	}
	if _, err := s.authorize(ctx, "comp-1", admin, domain.CanDeleteAttachment); err != nil {
		t.Errorf("admin borrando: %v", err)
	}
}

// Si la base falla, el error se propaga (será un 500), no se confunde con "no encontrado".
func TestAuthorizePropagatesDatabaseErrors(t *testing.T) {
	dbDown := errors.New("conexión rechazada")
	s := NewAttachmentService(&fakeComplaints{err: dbDown}, nil, filestore.NewMemoryStore())
	_, err := s.authorize(context.Background(), "comp-1", owner, domain.CanViewAttachments)
	if !errors.Is(err, dbDown) || errors.Is(err, ErrComplaintNotFound) {
		t.Fatalf("want el error de la base, got %v", err)
	}
}
