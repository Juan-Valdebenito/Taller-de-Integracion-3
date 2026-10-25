package handler

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/attachment"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// AttachmentService es lo que el handler necesita del servicio de imágenes (lo
// implementa service.AttachmentService). Permite probar el handler sin base de datos.
type AttachmentService interface {
	Upload(ctx context.Context, actor domain.Actor, complaintID string, file io.Reader, maskRegionsJSON string) (*domain.ComplaintAttachment, error)
	List(ctx context.Context, actor domain.Actor, complaintID string) ([]domain.ComplaintAttachment, error)
	Open(ctx context.Context, actor domain.Actor, complaintID, attachmentID string) (*domain.ComplaintAttachment, io.ReadCloser, error)
	Delete(ctx context.Context, actor domain.Actor, complaintID, attachmentID string) error
}

// AttachmentHandler expone las imágenes de los reclamos por HTTP.
type AttachmentHandler struct {
	svc AttachmentService
}

func NewAttachmentHandler(svc AttachmentService) *AttachmentHandler {
	return &AttachmentHandler{svc: svc}
}

// actorFrom arma el Actor con el usuario que dejó el middleware de autenticación.
// Sin sesión (o con valores de tipo inesperado) devuelve un Actor vacío.
func actorFrom(c *gin.Context) domain.Actor {
	id, _ := c.Get(middleware.ContextUserID)
	role, _ := c.Get(middleware.ContextUserRole)
	idStr, _ := id.(string)
	roleStr, _ := role.(string)
	return domain.Actor{UserID: idStr, Role: domain.UserRole(roleStr)}
}

// attachmentErrorMessage es el mensaje genérico para los errores internos: el
// detalle técnico va al log, nunca a la respuesta.
const attachmentErrorMessage = "ocurrió un error al procesar la imagen, intenta nuevamente"

// attachmentErrorStatus asocia cada error conocido a su código HTTP. Se revisan
// en orden: el primero que coincide (con errors.Is) define la respuesta.
var attachmentErrorStatus = []struct {
	err    error
	status int
}{
	{service.ErrComplaintNotFound, http.StatusNotFound},
	{repository.ErrAttachmentComplaintNotFound, http.StatusNotFound},
	{service.ErrAttachmentNotFound, http.StatusNotFound},
	{service.ErrAttachmentForbidden, http.StatusForbidden},
	{service.ErrAttachmentStorageUnavailable, http.StatusServiceUnavailable},
	{repository.ErrAttachmentDuplicate, http.StatusConflict},
	{domain.ErrAttachmentLimitReached, http.StatusConflict},
	{domain.ErrAttachmentTooLarge, http.StatusRequestEntityTooLarge},
	{domain.ErrAttachmentUnsupportedType, http.StatusUnsupportedMediaType},
}

// attachmentError traduce un error del servicio a código HTTP y mensaje para
// el usuario. El mensaje es siempre el del error conocido (no el texto completo,
// que puede traer detalles internos); los errores desconocidos son 500.
func attachmentError(err error) (int, string) {
	for _, known := range attachmentErrorStatus {
		if errors.Is(err, known.err) {
			// El reclamo inexistente que detecta el repositorio se informa con el
			// mismo mensaje que el del servicio.
			if known.err == repository.ErrAttachmentComplaintNotFound {
				return known.status, service.ErrComplaintNotFound.Error()
			}
			return known.status, known.err.Error()
		}
	}
	// Zona inválida: el mensaje dice qué zona falla ("la zona 2 sale de la imagen").
	var regionErr *attachment.MaskRegionError
	if errors.As(err, &regionErr) {
		return http.StatusBadRequest, regionErr.Error()
	}
	if attachment.IsClientError(err) {
		return http.StatusBadRequest, clientErrorMessage(err)
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return http.StatusRequestTimeout, "la solicitud se canceló o tardó demasiado"
	}
	return http.StatusInternalServerError, attachmentErrorMessage
}

// clientErrorSentinels: errores del archivo o de las zonas cuyo mensaje se
// muestra tal cual (sin el detalle técnico que puedan traer envuelto).
var clientErrorSentinels = []error{
	domain.ErrAttachmentEmpty,
	domain.ErrAttachmentDimensions,
	attachment.ErrAttachmentCorrupt,
	attachment.ErrAttachmentRead,
	attachment.ErrTooManyMaskRegions,
	attachment.ErrMaskRegionsTooLarge,
	attachment.ErrInvalidMaskRegionsFormat,
}

func clientErrorMessage(err error) string {
	for _, sentinel := range clientErrorSentinels {
		if errors.Is(err, sentinel) {
			return sentinel.Error()
		}
	}
	return "la imagen enviada no es válida"
}

// respondAttachmentError responde el error con su código y mensaje; los
// errores internos (5xx) se registran en el log con su detalle.
func respondAttachmentError(c *gin.Context, err error) {
	status, message := attachmentError(err)
	if status >= http.StatusInternalServerError {
		log.Error().Err(err).Str("event", "attachment_request_failed").
			Str("path", c.FullPath()).Str("complaint_id", c.Param("id")).
			Msg("Complaint image request failed")
	}
	c.JSON(status, gin.H{"error": message})
}
