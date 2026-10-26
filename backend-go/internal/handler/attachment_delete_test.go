package handler

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// deleteFake registra con qué datos se pidió borrar.
type deleteFake struct {
	called bool
	actor  domain.Actor
	ids    [2]string
	err    error
}

func (f *deleteFake) Upload(context.Context, domain.Actor, string, io.Reader, string) (*domain.ComplaintAttachment, error) {
	return nil, errors.New("no usado")
}

func (f *deleteFake) List(context.Context, domain.Actor, string) ([]domain.ComplaintAttachment, error) {
	return nil, errors.New("no usado")
}

func (f *deleteFake) Open(context.Context, domain.Actor, string, string) (*domain.ComplaintAttachment, io.ReadCloser, error) {
	return nil, nil, errors.New("no usado")
}

func (f *deleteFake) Delete(_ context.Context, actor domain.Actor, complaintID, attachmentID string) error {
	f.called, f.actor, f.ids = true, actor, [2]string{complaintID, attachmentID}
	return f.err
}

func deleteRequest(t *testing.T, svc AttachmentService) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.DELETE("/api/v1/complaints/:id/attachments/:attachmentId", func(c *gin.Context) {
		c.Set(middleware.ContextUserID, "usr-pass-01")
		c.Set(middleware.ContextUserRole, "PASSENGER")
	}, NewAttachmentHandler(svc).Delete)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/api/v1/complaints/comp-1/attachments/att-1", nil))
	return w
}

func TestDeleteEndpointRespondsNoContent(t *testing.T) {
	svc := &deleteFake{}
	w := deleteRequest(t, svc)

	if w.Code != http.StatusNoContent || w.Body.Len() != 0 {
		t.Fatalf("got %d %q, want 204 sin cuerpo", w.Code, w.Body.String())
	}
	want := domain.Actor{UserID: "usr-pass-01", Role: domain.UserRolePassenger}
	if !svc.called || svc.actor != want || svc.ids != [2]string{"comp-1", "att-1"} {
		t.Fatalf("el servicio debe recibir el usuario, el reclamo y la imagen: %+v", svc)
	}
}

func TestDeleteEndpointErrors(t *testing.T) {
	cases := []struct {
		err     error
		status  int
		message string
	}{
		{service.ErrComplaintNotFound, http.StatusNotFound, "reclamo no encontrado"},
		{service.ErrAttachmentNotFound, http.StatusNotFound, "imagen no encontrada"},
		{service.ErrAttachmentForbidden, http.StatusForbidden, service.ErrAttachmentForbidden.Error()},
		{service.ErrAttachmentStorageUnavailable, http.StatusServiceUnavailable, service.ErrAttachmentStorageUnavailable.Error()},
		{errors.New("la base no responde: timeout en 10.0.0.5"), http.StatusInternalServerError, attachmentErrorMessage},
	}
	for _, tc := range cases {
		w := deleteRequest(t, &deleteFake{err: tc.err})
		if w.Code != tc.status || errorOf(t, w) != tc.message {
			t.Errorf("%v: got %d %s", tc.err, w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "10.0.0.5") {
			t.Errorf("el detalle interno no debe llegar al usuario: %s", w.Body.String())
		}
	}
}
