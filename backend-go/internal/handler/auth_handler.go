package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// AuthHandler maneja los endpoints de autenticación.
type AuthHandler struct {
	userRepo  *repository.UserRepository
	jwtSecret string
	blacklist *token.Blacklist
}

func NewAuthHandler(userRepo *repository.UserRepository, jwtSecret string, bl *token.Blacklist) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, jwtSecret: jwtSecret, blacklist: bl}
}

// generateJTI crea un identificador único para el token (JWT ID).
func generateJTI() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// generateToken crea un JWT firmado HS256 con los datos del usuario.
// Incluye el claim "jti" para poder revocar tokens específicos en el logout.
func (h *AuthHandler) generateToken(user *domain.User) (string, time.Time, error) {
	jti, err := generateJTI()
	if err != nil {
		return "", time.Time{}, err
	}

	exp := time.Now().Add(7 * 24 * time.Hour)

	claims := jwt.MapClaims{
		"jti":   jti,
		"id":    user.ID,
		"email": user.Email,
		"role":  string(user.Role),
		"exp":   exp.Unix(),
		"iat":   time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := t.SignedString([]byte(h.jwtSecret))
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, exp, nil
}

// Register godoc
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Name      string `json:"name" binding:"required"`
		Email     string `json:"email" binding:"required,email"`
		Password  string `json:"password" binding:"required,min=6"`
		Role      string `json:"role"`
		CompanyID string `json:"companyId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verificar email duplicado
	existing, err := h.userRepo.FindByEmail(c.Request.Context(), body.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al verificar email"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("El email %s ya está registrado", body.Email)})
		return
	}

	// Hash de contraseña
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al procesar contraseña"})
		return
	}

	role := domain.UserRolePassenger
	if body.Role == string(domain.UserRoleCompany) {
		role = domain.UserRoleCompany
	} else if body.Role == string(domain.UserRoleAdmin) {
		role = domain.UserRoleAdmin
	}

	var companyID *string
	if body.CompanyID != "" {
		companyID = &body.CompanyID
	}

	user, err := h.userRepo.Create(c.Request.Context(), body.Name, body.Email, string(hash), role, companyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear usuario"})
		return
	}

	tokenStr, _, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"token": tokenStr, "user": user})
}

// Login godoc
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.FindByEmail(c.Request.Context(), body.Email)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales inválidas"})
		return
	}

	// Verificar que la cuenta esté activa
	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cuenta desactivada. Contacta al administrador"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales inválidas"})
		return
	}

	tokenStr, _, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": tokenStr, "user": user})
}

// Logout godoc
// POST /api/v1/auth/logout — requiere middleware Authenticate
// Revoca el token actual agregándolo al blacklist hasta su expiración.
func (h *AuthHandler) Logout(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada correctamente"})
		return
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	// Parsear sin verificar nuevamente (el middleware ya lo hizo)
	p := jwt.NewParser()
	parsed, _, err := p.ParseUnverified(tokenStr, jwt.MapClaims{})
	if err == nil {
		if claims, ok := parsed.Claims.(jwt.MapClaims); ok {
			jti, _ := claims["jti"].(string)
			expFloat, _ := claims["exp"].(float64)
			if jti != "" && expFloat > 0 {
				exp := time.Unix(int64(expFloat), 0)
				h.blacklist.Revoke(jti, exp)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada correctamente"})
}

// Me godoc
// GET /api/v1/auth/me — requiere middleware Authenticate
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserID)
	user, err := h.userRepo.FindByID(c.Request.Context(), userID.(string))
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}
	c.JSON(http.StatusOK, user)
}
