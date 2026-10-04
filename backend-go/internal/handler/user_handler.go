package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// UserHandler maneja los endpoints de usuarios.
type UserHandler struct {
	userRepo *repository.UserRepository
}

func NewUserHandler(userRepo *repository.UserRepository) *UserHandler {
	return &UserHandler{userRepo: userRepo}
}

// GetAll godoc
// GET /api/v1/users
func (h *UserHandler) GetAll(c *gin.Context) {
	users, err := h.userRepo.FindAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener usuarios"})
		return
	}
	c.JSON(http.StatusOK, users)
}

// GetByID godoc
// GET /api/v1/users/:id
func (h *UserHandler) GetByID(c *gin.Context) {
	user, err := h.userRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener usuario"})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// Update godoc
// PUT /api/v1/users/:id — actualización de usuario (name, role, email, isActive)
func (h *UserHandler) Update(c *gin.Context) {
	var body struct {
		Name     string  `json:"name" binding:"required"`
		Role     string  `json:"role" binding:"required"`
		Email    *string `json:"email"`
		IsActive *bool   `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.Update(c.Request.Context(), c.Param("id"), body.Name, domain.UserRole(body.Role), body.Email, body.IsActive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar usuario: " + err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// Patch godoc
// PATCH /api/v1/users/:id — modificación parcial (name, email, role, isActive, companyId)
func (h *UserHandler) Patch(c *gin.Context) {
	var body struct {
		Name      *string `json:"name"`
		Email     *string `json:"email"`
		Role      *string `json:"role"`
		IsActive  *bool   `json:"isActive"`
		CompanyID *string `json:"companyId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Name == nil && body.Email == nil && body.Role == nil && body.IsActive == nil && body.CompanyID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debe especificar al menos un campo para actualizar"})
		return
	}

	var rolePtr *domain.UserRole
	if body.Role != nil {
		r := domain.UserRole(*body.Role)
		rolePtr = &r
	}

	user, err := h.userRepo.UpdatePartial(c.Request.Context(), c.Param("id"), body.Name, body.Email, rolePtr, body.IsActive, body.CompanyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar parcialmente el usuario: " + err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// Delete godoc
// DELETE /api/v1/users/:id — Soft Delete (isActive = false)
func (h *UserHandler) Delete(c *gin.Context) {
	user, err := h.userRepo.SoftDelete(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al desactivar usuario: " + err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "Usuario desactivado correctamente (Soft Delete)",
		"id":       user.ID,
		"isActive": user.IsActive,
		"user":     user,
	})
}
