package handler

import (
	"context"
	"errors"
	"fmt"
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

// Campos del formulario multipart de subida.
const (
	uploadFileField  = "file"
	uploadMaskField  = "maskRegions"
	multipartMargin  = 64 << 10 // cabeceras y separadores del formulario
	maxUploadRequest = domain.MaxAttachmentSizeBytes + attachment.MaxMaskRegionsJSONBytes + multipartMargin
)

// Upload godoc
// POST /api/v1/complaints/:id/attachments — sube una foto al reclamo.
// Formulario multipart: "file" (la imagen, obligatoria) y "maskRegions"
// (opcional, JSON con las zonas a ocultar). Responde 201 con la imagen creada.
func (h *AttachmentHandler) Upload(c *gin.Context) {
	// Toda la solicitud se lee con límite: si alguien envía más, se corta sin
	// cargarla entera. Como el límite es menor que la memoria permitida para el
	// formulario, nunca se escriben archivos temporales.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadRequest)
	if err := c.Request.ParseMultipartForm(maxUploadRequest + 1); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": domain.ErrAttachmentTooLarge.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": `la imagen debe enviarse como formulario multipart con el campo "file"`})
		return
	}
	defer c.Request.MultipartForm.RemoveAll()

	files := c.Request.MultipartForm.File[uploadFileField]
	switch {
	case len(files) == 0:
		c.JSON(http.StatusBadRequest, gin.H{"error": `falta la imagen: envíala en el campo "file"`})
		return
	case len(files) > 1:
		c.JSON(http.StatusBadRequest, gin.H{"error": "envía una sola imagen por solicitud"})
		return
	}
	file, err := files[0].Open()
	if err != nil {
		respondAttachmentError(c, err)
		return
	}
	defer file.Close()

	saved, err := h.svc.Upload(c.Request.Context(), actorFrom(c), c.Param("id"), file, c.Request.FormValue(uploadMaskField))
	if err != nil {
		respondAttachmentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, saved)
}

// List godoc
// GET /api/v1/complaints/:id/attachments — imágenes del reclamo, en orden de subida.
func (h *AttachmentHandler) List(c *gin.Context) {
	attachments, err := h.svc.List(c.Request.Context(), actorFrom(c), c.Param("id"))
	if err != nil {
		respondAttachmentError(c, err)
		return
	}
	c.JSON(http.StatusOK, attachments)
}

// Download godoc
// GET /api/v1/complaints/:id/attachments/:attachmentId/file — descarga la imagen.
// Se envía por partes (sin cargarla entera en memoria) y con encabezados que
// impiden que el navegador la interprete como otra cosa o que la guarde una
// caché intermedia (es un dato personal).
func (h *AttachmentHandler) Download(c *gin.Context) {
	att, file, err := h.svc.Open(c.Request.Context(), actorFrom(c), c.Param("id"), c.Param("attachmentId"))
	if err != nil {
		respondAttachmentError(c, err)
		return
	}
	defer file.Close()

	// El tipo viene de la base, pero se revisa igual: solo se sirven JPEG y PNG.
	ext, err := domain.AttachmentExtension(att.MimeType)
	if err != nil {
		respondAttachmentError(c, fmt.Errorf("imagen %s con tipo inesperado %q: %w", att.ID, att.MimeType, errUnexpectedType))
		return
	}
	c.DataFromReader(http.StatusOK, att.SizeBytes, att.MimeType, file, map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		"Cache-Control":           "private, no-store",
		// Nombre genérico: nunca el nombre original del archivo.
		"Content-Disposition": fmt.Sprintf(`inline; filename="reclamo-imagen-%s%s"`, safeFilenamePart(att.ID), ext),
	})
}

// Delete godoc
// DELETE /api/v1/complaints/:id/attachments/:attachmentId — borra una imagen del
// reclamo (el dueño o un administrador). Responde 204 sin contenido.
func (h *AttachmentHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Request.Context(), actorFrom(c), c.Param("id"), c.Param("attachmentId")); err != nil {
		respondAttachmentError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// errUnexpectedType: una imagen guardada con un tipo que no es JPEG ni PNG
// (dato inconsistente); se responde como error interno.
var errUnexpectedType = errors.New("tipo de imagen inesperado")

// safeFilenamePart deja solo letras ASCII, dígitos y "-" para el nombre del
// archivo descargado (el id viene de la base, pero no se arma una cabecera con
// caracteres que puedan romperla).
func safeFilenamePart(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s) && len(out) < 64; i++ {
		ch := s[i]
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '-' {
			out = append(out, ch)
		}
	}
	if len(out) == 0 {
		return "archivo"
	}
	return string(out)
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
