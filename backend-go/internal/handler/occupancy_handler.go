package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// OccupancyHandler expone el endpoint de predicción de ocupación.
type OccupancyHandler struct {
	svc *service.OccupancyService
}

func NewOccupancyHandler(svc *service.OccupancyService) *OccupancyHandler {
	return &OccupancyHandler{svc: svc}
}

// occupancyRequest es el cuerpo JSON esperado en POST /api/v1/occupancy.
type occupancyRequest struct {
	CurrentPassengers int     `json:"currentPassengers" binding:"required,min=0"`
	Capacity          int     `json:"capacity"          binding:"required,min=1"`
	RouteID           string  `json:"routeId"`
	Hour              *int    `json:"hour"`      // 0–23 (nil → hora actual)
	DayOfWeek         *int    `json:"dayOfWeek"` // 0=Dom…6=Sáb (nil → hoy)
}

// Predict godoc
// POST /api/v1/occupancy
//
// Predice el nivel de ocupación de una micro para el próximo tramo.
// El campo "isSimulated" indica si la predicción usa heurísticas (true)
// o un modelo ML real (false).
//
// Punto de migración: para conectar el clúster ML basta con llamar a
//   handler.svc.SetPredictor(mlPredictor)
// al arrancar el servidor. Este handler no cambia.
func (h *OccupancyHandler) Predict(c *gin.Context) {
	var req occupancyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validación cruzada: los pasajeros no pueden superar la capacidad
	if req.CurrentPassengers > req.Capacity {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "\"currentPassengers\" no puede ser mayor que \"capacity\"",
		})
		return
	}

	// Validación opcional de rangos hora / día
	if req.Hour != nil && (*req.Hour < 0 || *req.Hour > 23) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "\"hour\" debe estar entre 0 y 23",
		})
		return
	}
	if req.DayOfWeek != nil && (*req.DayOfWeek < 0 || *req.DayOfWeek > 6) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "\"dayOfWeek\" debe estar entre 0 (domingo) y 6 (sábado)",
		})
		return
	}

	input := service.OccupancyInput{
		CurrentPassengers: req.CurrentPassengers,
		Capacity:          req.Capacity,
		RouteID:           req.RouteID,
		Hour:              req.Hour,
		DayOfWeek:         req.DayOfWeek,
	}

	result, err := h.svc.Predict(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al calcular predicción de ocupación"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
