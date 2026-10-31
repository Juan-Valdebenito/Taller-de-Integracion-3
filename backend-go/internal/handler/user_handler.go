package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/security"
)

// UserHandler maneja los endpoints de usuarios.
type UserHandler struct {
	userRepo *repository.UserRepository
}

func NewUserHandler(userRepo *repository.UserRepository) *UserHandler {
	return &UserHandler{userRepo: userRepo}
}

// NewUserRequest es el cuerpo de POST /api/v1/users.
type NewUserRequest struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Role      string `json:"role"`
	CompanyID string `json:"companyId"`
}

// validRoles son los roles que acepta backend-go.
var validRoles = map[domain.UserRole]bool{
	domain.UserRolePassenger: true,
	domain.UserRoleCompany:   true,
	domain.UserRoleAdmin:     true,
}

// validateNewUser revisa el rol y la empresa de una cuenta creada por el
// administrador. La empresa solo se guarda para el rol Empresa, y en ese caso
// es obligatoria. El correo, el nombre y la contraseña ya los valida
// middleware.ValidateUserPayload.
func validateNewUser(req NewUserRequest) (domain.UserRole, *string, string) {
	role := domain.UserRole(strings.TrimSpace(req.Role))
	if role == "" {
		role = domain.UserRolePassenger
	}
	if !validRoles[role] {
		return "", nil, "Rol no válido. Roles permitidos: PASSENGER, COMPANY, ADMIN"
	}
	if role != domain.UserRoleCompany {
		return role, nil, ""
	}
	companyID := strings.TrimSpace(req.CompanyID)
	if companyID == "" {
		return "", nil, "Una cuenta de empresa necesita la empresa a la que pertenece (companyId)"
	}
	return role, &companyID, ""
}

// Create godoc
// POST /api/v1/users — el administrador crea una cuenta con cualquier rol.
// A diferencia de /auth/register no inicia sesión con la cuenta nueva (no
// entrega tokens). Responde 409 si el correo ya existe y 400 si la empresa no
// existe.
func (h *UserHandler) Create(c *gin.Context) {
	var req NewUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato JSON inválido"})
		return
	}
	role, companyID, invalid := validateNewUser(req)
	if invalid != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": invalid})
		return
	}
	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := h.userRepo.Create(c.Request.Context(), strings.TrimSpace(req.Name), strings.TrimSpace(req.Email), hash, role, companyID)
	switch {
	case errors.Is(err, repository.ErrUserDuplicateEmail):
		c.JSON(http.StatusConflict, gin.H{"error": "El email " + strings.TrimSpace(req.Email) + " ya está registrado"})
	case errors.Is(err, repository.ErrUserCompanyNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "La empresa indicada no existe"})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear usuario"})
	default:
		c.JSON(http.StatusCreated, user)
	}
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
