package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// StopHandler maneja los endpoints de administración de paraderos.
type StopHandler struct {
	stopRepo *repository.StopRepository
}

func NewStopHandler(stopRepo *repository.StopRepository) *StopHandler {
	return &StopHandler{stopRepo: stopRepo}
}

// GetByID godoc
// GET /api/v1/stops/:id
func (h *StopHandler) GetByID(c *gin.Context) {
	stop, err := h.stopRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener paradero"})
		return
	}
	if stop == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Paradero no encontrado"})
		return
	}
	c.JSON(http.StatusOK, stop)
}

// Create godoc
// POST /api/v1/stops — admin
func (h *StopHandler) Create(c *gin.Context) {
	var body struct {
		Name      string  `json:"name" binding:"required"`
		Latitude  float64 `json:"latitude" binding:"required"`
		Longitude float64 `json:"longitude" binding:"required"`
		Order     int     `json:"order"`
		RouteID   string  `json:"routeId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stop, err := h.stopRepo.Create(c.Request.Context(), body.Name, body.Latitude, body.Longitude, body.Order, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear paradero"})
		return
	}
	c.JSON(http.StatusCreated, stop)
}

// Update godoc
// PUT /api/v1/stops/:id — admin
func (h *StopHandler) Update(c *gin.Context) {
	var body struct {
		Name      string  `json:"name" binding:"required"`
		Latitude  float64 `json:"latitude" binding:"required"`
		Longitude float64 `json:"longitude" binding:"required"`
		Order     int     `json:"order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stop, err := h.stopRepo.Update(c.Request.Context(), c.Param("id"), body.Name, body.Latitude, body.Longitude, body.Order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar paradero"})
		return
	}
	if stop == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Paradero no encontrado"})
		return
	}
	c.JSON(http.StatusOK, stop)
}

// Delete godoc
// DELETE /api/v1/stops/:id — admin
func (h *StopHandler) Delete(c *gin.Context) {
	err := h.stopRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Paradero no encontrado"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar paradero"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Paradero eliminado correctamente"})
}
