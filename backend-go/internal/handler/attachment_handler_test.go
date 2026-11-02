package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// El servicio real cumple la interfaz que usa el handler.
var _ AttachmentService = (*service.AttachmentService)(nil)

func TestAttachmentErrorStatusAndMessage(t *testing.T) {
	_, regionErr := attachment.ParseMaskRegions(`[{"x":0.9,"y":0,"width":0.5,"height":0.5}]`)

	cases := []struct {
		name    string
		err     error
		status  int
		message string
	}{
		{"reclamo no encontrado / sin acceso", service.ErrComplaintNotFound, 404, "reclamo no encontrado"},
		{"reclamo borrado durante la subida", repository.ErrAttachmentComplaintNotFound, 404, "reclamo no encontrado"},
		{"imagen no encontrada", service.ErrAttachmentNotFound, 404, "imagen no encontrada"},
		{"sin permiso para la acción", service.ErrAttachmentForbidden, 403, service.ErrAttachmentForbidden.Error()},
		{"almacenamiento caído", service.ErrAttachmentStorageUnavailable, 503, service.ErrAttachmentStorageUnavailable.Error()},
		{"imagen duplicada", repository.ErrAttachmentDuplicate, 409, "esta imagen ya está adjunta al reclamo"},
		{"reclamo con 3 imágenes", domain.ErrAttachmentLimitReached, 409, "el reclamo ya tiene el máximo de 3 imágenes"},
		{"más de 5 MB", domain.ErrAttachmentTooLarge, 413, "la imagen supera el tamaño máximo de 5 MB"},
		{"formato no permitido", domain.ErrAttachmentUnsupportedType, 415, "formato de imagen no permitido: solo JPEG o PNG"},
		{"imagen vacía", domain.ErrAttachmentEmpty, 400, "la imagen está vacía"},
		{"bomba de descompresión", domain.ErrAttachmentDimensions, 400, domain.ErrAttachmentDimensions.Error()},
		{"imagen dañada", attachment.ErrAttachmentCorrupt, 400, "la imagen está dañada o incompleta"},
		{"zona fuera de la imagen", regionErr, 400, "la zona 1 sale de la imagen"},
		{"demasiadas zonas", attachment.ErrTooManyMaskRegions, 400, attachment.ErrTooManyMaskRegions.Error()},
		{"zonas mal formadas", attachment.ErrInvalidMaskRegionsFormat, 400, attachment.ErrInvalidMaskRegionsFormat.Error()},
		{"petición cancelada", context.Canceled, 408, "la solicitud se canceló o tardó demasiado"},
		{"error desconocido", errors.New("pq: disco lleno en /var/lib/postgresql"), 500, attachmentErrorMessage},
	}
	for _, tc := range cases {
		status, message := attachmentError(tc.err)
		if status != tc.status || message != tc.message {
			t.Errorf("%s: got %d %q, want %d %q", tc.name, status, message, tc.status, tc.message)
		}
	}
}

// Un error conocido envuelto con detalles técnicos responde solo el mensaje
// conocido: los detalles (rutas, red, SQL) nunca llegan al usuario.
func TestAttachmentErrorDoesNotLeakDetails(t *testing.T) {
	cases := []error{
		fmt.Errorf("AttachmentService.Upload: guardando el archivo complaints/c1/abc.jpg: %w", service.ErrAttachmentStorageUnavailable),
		fmt.Errorf("%w: read tcp 10.0.0.5:3001->10.0.0.9:51234: connection reset by peer", attachment.ErrAttachmentRead),
		fmt.Errorf("%w (además no se pudo borrar el archivo sin registrar complaints/c1/abc.jpg: permiso denegado)", repository.ErrAttachmentDuplicate),
		fmt.Errorf("AttachmentService.List: SELECT ... FROM complaint_attachments: timeout"),
	}
	for _, err := range cases {
		_, message := attachmentError(err)
		for _, leaked := range []string{"complaints/", "tcp", "10.0.0", "SELECT", "permiso denegado"} {
			if strings.Contains(message, leaked) {
				t.Errorf("el mensaje %q filtra %q", message, leaked)
			}
		}
	}
}

func TestActorFromContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name string
		set  map[string]any
		want domain.Actor
	}{
		{"pasajero autenticado", map[string]any{middleware.ContextUserID: "usr-pass-01", middleware.ContextUserRole: "PASSENGER"},
			domain.Actor{UserID: "usr-pass-01", Role: domain.UserRolePassenger}},
		{"sin sesión", map[string]any{}, domain.Actor{}},
		{"tipos inesperados", map[string]any{middleware.ContextUserID: 123, middleware.ContextUserRole: true}, domain.Actor{}},
	}
	for _, tc := range cases {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		for k, v := range tc.set {
			c.Set(k, v)
		}
		if got := actorFrom(c); got != tc.want {
			t.Errorf("%s: got %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

// La respuesta HTTP tiene el código y el JSON {"error": mensaje}.
func TestRespondAttachmentError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/complaints/comp-1/attachments", nil)

	respondAttachmentError(c, domain.ErrAttachmentTooLarge)

	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status %d", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["error"] != "la imagen supera el tamaño máximo de 5 MB" {
		t.Fatalf("body %s (%v)", w.Body.String(), err)
	}
}
