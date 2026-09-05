package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// ComplaintHandler maneja los endpoints de reclamos.
type ComplaintHandler struct {
	complaintRepo *repository.ComplaintRepository
}

func NewComplaintHandler(complaintRepo *repository.ComplaintRepository) *ComplaintHandler {
	return &ComplaintHandler{complaintRepo: complaintRepo}
}

// GetAll godoc
// GET /api/v1/complaints
func (h *ComplaintHandler) GetAll(c *gin.Context) {
	complaints, err := h.complaintRepo.FindAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamos"})
		return
	}
	if complaints == nil {
		complaints = []domain.Complaint{}
	}
	c.JSON(http.StatusOK, complaints)
}

// GetByID godoc
// GET /api/v1/complaints/:id
func (h *ComplaintHandler) GetByID(c *gin.Context) {
	complaint, err := h.complaintRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamo"})
		return
	}
	if complaint == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
		return
	}
	c.JSON(http.StatusOK, complaint)
}

// Create godoc
// POST /api/v1/complaints — solo pasajeros autenticados
func (h *ComplaintHandler) Create(c *gin.Context) {
	var body struct {
		Title       string  `json:"title" binding:"required"`
		Description string  `json:"description" binding:"required"`
		Category    string  `json:"category" binding:"required"`
		CompanyID   string  `json:"companyId" binding:"required"`
		BusID       *string `json:"busId"`
		RouteID     *string `json:"routeId"`
		TripID      *string `json:"tripId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// El pasajero es el usuario autenticado
	passengerID, _ := c.Get(middleware.ContextUserID)

	complaint, err := h.complaintRepo.Create(
		c.Request.Context(),
		body.Title,
		body.Description,
		domain.ComplaintCategory(body.Category),
		passengerID.(string),
		body.CompanyID,
		body.BusID,
		body.RouteID,
		body.TripID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo"})
		return
	}
	c.JSON(http.StatusCreated, complaint)
}

// UpdateStatus godoc
// PUT /api/v1/complaints/:id/status — empresa o admin
func (h *ComplaintHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status        string  `json:"status" binding:"required"`
		AdminResponse *string `json:"adminResponse"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	complaint, err := h.complaintRepo.UpdateStatus(
		c.Request.Context(),
		c.Param("id"),
		domain.ComplaintStatus(body.Status),
		body.AdminResponse,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar estado del reclamo"})
		return
	}
	if complaint == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
		return
	}
	c.JSON(http.StatusOK, complaint)
}

// Delete godoc
// DELETE /api/v1/complaints/:id — admin
func (h *ComplaintHandler) Delete(c *gin.Context) {
	err := h.complaintRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar reclamo"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Reclamo eliminado correctamente"})
}
