package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// Rutas de las imágenes de un reclamo, bajo /api/v1/complaints:
//
//	POST   /:id/attachments                         subir (multipart: file, maskRegions)
//	GET    /:id/attachments                         listar
//	GET    /:id/attachments/:attachmentId/file      descargar
//	DELETE /:id/attachments/:attachmentId           borrar
const (
	attachmentsPath    = "/:id/attachments"
	attachmentPath     = "/:id/attachments/:attachmentId"
	attachmentFilePath = "/:id/attachments/:attachmentId/file"
)

// registerAttachmentRoutes monta las rutas de imágenes en el grupo de reclamos.
// Todas exigen sesión (auth); los permisos finos (dueño / administrador) los
// aplica el servicio. Si attachmentH es nil (almacenamiento no disponible al
// iniciar), las rutas existen igual y responden 503. uploadLimiter (opcional)
// limita las subidas por IP, antes de autenticar, para frenar abusos baratos.
func registerAttachmentRoutes(
	complaints *gin.RouterGroup,
	attachmentH *handler.AttachmentHandler,
	uploadLimiter *middleware.IPRateLimiter,
	auth func() gin.HandlerFunc,
) {
	if attachmentH == nil {
		unavailable := attachmentsUnavailable()
		complaints.POST(attachmentsPath, unavailable)
		complaints.GET(attachmentsPath, unavailable)
		complaints.GET(attachmentFilePath, unavailable)
		complaints.DELETE(attachmentPath, unavailable)
		return
	}

	uploadLimit := func(c *gin.Context) { c.Next() }
	if uploadLimiter != nil {
		uploadLimit = uploadLimiter.Middleware()
	}
	complaints.POST(attachmentsPath, uploadLimit, auth(), attachmentH.Upload)
	complaints.GET(attachmentsPath, auth(), attachmentH.List)
	complaints.GET(attachmentFilePath, auth(), attachmentH.Download)
	complaints.DELETE(attachmentPath, auth(), attachmentH.Delete)
}

// attachmentsUnavailable responde 503 cuando el almacenamiento de imágenes no
// está disponible (ver ATTACHMENTS_DIR), igual que las rutas sin base de datos.
func attachmentsUnavailable() gin.HandlerFunc {
	return func(c *gin.Context) {
		log.Warn().
			Str("event", "attachments_storage_unavailable").
			Str("path", c.Request.URL.Path).
			Msg("Request rejected: complaint image storage unavailable")
		c.Header("Retry-After", "30")
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"error": service.ErrAttachmentStorageUnavailable.Error(),
		})
	}
}
