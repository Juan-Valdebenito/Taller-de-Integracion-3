package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// RouteHandler maneja los endpoints de rutas.
type RouteHandler struct {
	routeRepo *repository.RouteRepository
	busRepo   *repository.BusRepository
}

func NewRouteHandler(routeRepo *repository.RouteRepository, busRepo *repository.BusRepository) *RouteHandler {
	return &RouteHandler{routeRepo: routeRepo, busRepo: busRepo}
}

// GetAll godoc
// GET /api/v1/routes
func (h *RouteHandler) GetAll(c *gin.Context) {
	routes, err := h.routeRepo.FindAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener rutas"})
		return
	}
	if routes == nil {
		routes = []domain.Route{}
	}
	c.JSON(http.StatusOK, routes)
}

// GetByID godoc
// GET /api/v1/routes/:id
func (h *RouteHandler) GetByID(c *gin.Context) {
	route, err := h.routeRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener ruta"})
		return
	}
	if route == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ruta no encontrada"})
		return
	}
	c.JSON(http.StatusOK, route)
}

// GetStops godoc
// GET /api/v1/routes/:id/stops
func (h *RouteHandler) GetStops(c *gin.Context) {
	stops, err := h.routeRepo.FindStopsByRouteID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener paradas"})
		return
	}
	if stops == nil {
		stops = []domain.Stop{}
	}
	c.JSON(http.StatusOK, stops)
}

// GetBuses godoc
// GET /api/v1/routes/:id/buses — retorna buses activos en la ruta
func (h *RouteHandler) GetBuses(c *gin.Context) {
	buses, err := h.busRepo.FindActiveByRouteID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener buses de la ruta"})
		return
	}
	if buses == nil {
		buses = []domain.Bus{}
	}
	c.JSON(http.StatusOK, buses)
}

// Create godoc
// POST /api/v1/routes
func (h *RouteHandler) Create(c *gin.Context) {
	var body struct {
		Name        string  `json:"name" binding:"required"`
		Code        string  `json:"code" binding:"required"`
		Description *string `json:"description"`
		CompanyID   string  `json:"companyId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	route, err := h.routeRepo.Create(c.Request.Context(), body.Name, body.Code, body.Description, body.CompanyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear ruta"})
		return
	}
	c.JSON(http.StatusCreated, route)
}

// Update godoc
// PUT /api/v1/routes/:id
func (h *RouteHandler) Update(c *gin.Context) {
	var body struct {
		Name        string  `json:"name" binding:"required"`
		Code        string  `json:"code" binding:"required"`
		Description *string `json:"description"`
		IsActive    bool    `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	route, err := h.routeRepo.Update(c.Request.Context(), c.Param("id"), body.Name, body.Code, body.Description, body.IsActive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar ruta"})
		return
	}
	if route == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ruta no encontrada"})
		return
	}
	c.JSON(http.StatusOK, route)
}

// Delete godoc
// DELETE /api/v1/routes/:id
func (h *RouteHandler) Delete(c *gin.Context) {
	err := h.routeRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ruta no encontrada"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar ruta"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Ruta eliminada correctamente"})
}
