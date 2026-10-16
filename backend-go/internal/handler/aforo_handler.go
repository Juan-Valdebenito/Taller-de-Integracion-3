package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// AforoHandler expone los endpoints para cálculo y control de aforo vehicular estricto.
type AforoHandler struct {
	aforoSvc *service.AforoService
}

func NewAforoHandler(aforoSvc *service.AforoService) *AforoHandler {
	return &AforoHandler{aforoSvc: aforoSvc}
}

// CalculateStrict godoc
// POST /api/v1/aforo/calculate
func (h *AforoHandler) CalculateStrict(c *gin.Context) {
	var input service.AforoCalculationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parámetros inválidos: " + err.Error()})
		return
	}

	result, err := h.aforoSvc.CalculateStrictAforo(input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "fail",
			"error":   err.Error(),
			"message": "Violación de invariante en cálculo estricto de aforo vehicular",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// GetBusAforo godoc
// GET /api/v1/aforo/bus/:id
func (h *AforoHandler) GetBusAforo(c *gin.Context) {
	busID := c.Param("id")
	result, err := h.aforoSvc.GetBusAforo(c.Request.Context(), busID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// ProcessFlow godoc
// POST /api/v1/aforo/bus/:id/flow
func (h *AforoHandler) ProcessFlow(c *gin.Context) {
	busID := c.Param("id")
	var body struct {
		Boardings       int `json:"boardings"`
		Alightings      int `json:"alightings"`
		SchoolBoardings int `json:"schoolBoardings"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.aforoSvc.ProcessBusFlow(c.Request.Context(), busID, body.Boardings, body.Alightings, body.SchoolBoardings)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status": "fail",
			"error":  err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
