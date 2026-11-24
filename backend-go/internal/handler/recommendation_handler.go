package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RecommendRoutes responde GET /api/v1/recommendations/route: rutas entre cualquier
// origen y cualquier destino, ordenadas por costo según las preferencias. Aquí se
// revisa el formato de la URL y se agregan la ocupación en vivo y el clima; las
// rutas las calcula micro_service.
func (proxyHandler *GRPCProxyHandler) RecommendRoutes(ginContext *gin.Context) {
	request, err := recommendationRequestFromQuery(ginContext.Request.URL.Query())
	if err != nil {
		ginContext.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	request.LineOccupancy = proxyHandler.currentLineOccupancy()
	request.Weather = proxyHandler.currentWeatherMessage(ginContext.Request.Context())
	response, err := proxyHandler.micro.RecommendRoutes(ginContext.Request.Context(), request)
	if err != nil {
		writeRecommendationError(ginContext, err)
		return
	}
	ginContext.JSON(http.StatusOK, newRecommendationsJSON(response))
}
