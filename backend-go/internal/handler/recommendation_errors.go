package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// statusClientClosedRequest indica que quien llamó se fue antes de la respuesta.
// No es parte de HTTP: es una convención de nginx. El cliente no llega a verlo,
// pero en los logs no se confunde con una falla del servidor.
const statusClientClosedRequest = 499

const (
	recommendationUnavailableMessage = "El servicio de rutas no está disponible"
	recommendationFailedMessage      = "No se pudo consultar el servicio de rutas"
)

// recommendationHTTPError traduce un error de micro_service a HTTP. Los errores de
// la petición llevan el mensaje de micro_service, que dice qué corregir. Los del
// servidor llevan un mensaje general: el detalle puede incluir direcciones
// internas del cluster.
func recommendationHTTPError(err error) (httpStatus int, message string) {
	switch status.Code(err) {
	case codes.InvalidArgument:
		return http.StatusBadRequest, status.Convert(err).Message()
	case codes.NotFound:
		return http.StatusNotFound, status.Convert(err).Message()
	case codes.Unauthenticated:
		// micro_service rechazó la clave de backend-go. Un 401 haría creer a la app
		// que venció la sesión del usuario, y la cerraría.
		return http.StatusBadGateway, recommendationFailedMessage
	case codes.Unimplemented:
		// La imagen de micro_service es anterior a RecommendRoutes: para la app, el
		// servicio todavía no está disponible.
		return http.StatusServiceUnavailable, recommendationUnavailableMessage
	case codes.DeadlineExceeded, codes.Unavailable:
		return http.StatusServiceUnavailable, recommendationUnavailableMessage
	case codes.Canceled:
		return statusClientClosedRequest, "La petición se canceló"
	default:
		return http.StatusInternalServerError, recommendationFailedMessage
	}
}

// writeRecommendationError responde el error y, si es una falla del servidor, deja
// el detalle en el log.
func writeRecommendationError(ginContext *gin.Context, err error) {
	httpStatus, message := recommendationHTTPError(err)
	if httpStatus >= http.StatusInternalServerError {
		log.Error().Err(err).Str("event", "recommend_routes_failed").Msg("Could not get recommended routes from micro_service")
	}
	ginContext.JSON(httpStatus, gin.H{"error": message})
}
