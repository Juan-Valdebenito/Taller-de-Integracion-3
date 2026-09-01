package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// BusHandler maneja los endpoints de buses.
type BusHandler struct {
	busRepo *repository.BusRepository
}

func NewBusHandler(busRepo *repository.BusRepository) *BusHandler {
	return &BusHandler{busRepo: busRepo}
}

// GetAll godoc
// GET /api/v1/buses?routeId=xxx
func (h *BusHandler) GetAll(c *gin.Context) {
	routeID := c.Query("routeId")
	buses, err := h.busRepo.FindAll(c.Request.Context(), routeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener buses"})
		return
	}
	if buses == nil {
		buses = []domain.Bus{}
	}
	c.JSON(http.StatusOK, buses)
}

// GetByID godoc
// GET /api/v1/buses/:id
func (h *BusHandler) GetByID(c *gin.Context) {
	bus, err := h.busRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

// GetLocation godoc
// GET /api/v1/buses/:id/location — fallback REST para obtener última ubicación GPS
func (h *BusHandler) GetLocation(c *gin.Context) {
	bus, err := h.busRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"busId":         bus.ID,
		"lastLatitude":  bus.LastLatitude,
		"lastLongitude": bus.LastLongitude,
		"lastHeading":   bus.LastHeading,
		"lastSpeed":     bus.LastSpeed,
		"lastLocationAt": bus.LastLocationAt,
	})
}

// Create godoc
// POST /api/v1/buses
func (h *BusHandler) Create(c *gin.Context) {
	var body struct {
		Patente   string  `json:"patente" binding:"required"`
		Capacity  int     `json:"capacity" binding:"required,min=1"`
		CompanyID string  `json:"companyId" binding:"required"`
		RouteID   *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bus, err := h.busRepo.Create(c.Request.Context(), body.Patente, body.Capacity, body.CompanyID, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear bus"})
		return
	}
	c.JSON(http.StatusCreated, bus)
}

// Update godoc
// PUT /api/v1/buses/:id
func (h *BusHandler) Update(c *gin.Context) {
	var body struct {
		Patente  string `json:"patente" binding:"required"`
		Capacity int    `json:"capacity" binding:"required,min=1"`
		Status   string `json:"status" binding:"required"`
		RouteID  *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bus, err := h.busRepo.Update(c.Request.Context(), c.Param("id"), body.Patente, body.Capacity, domain.BusStatus(body.Status), body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

// Delete godoc
// DELETE /api/v1/buses/:id
func (h *BusHandler) Delete(c *gin.Context) {
	err := h.busRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar bus"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Bus eliminado correctamente"})
}
