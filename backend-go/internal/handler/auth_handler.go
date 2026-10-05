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

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/security"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// AuthHandler maneja los endpoints de autenticación.
type AuthHandler struct {
	userRepo  *repository.UserRepository
	jwtSecret string
	revStore       token.RevocationStore
	accessExpires  time.Duration
	refreshExpires time.Duration
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	jwtSecret string,
	accessExpires, refreshExpires time.Duration,
	revStore token.RevocationStore,
) *AuthHandler {
	return &AuthHandler{
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		revStore:       revStore,
		accessExpires:  accessExpires,
		refreshExpires: refreshExpires,
	}
}

// issueTokens genera el par access + refresh y arma la respuesta de login/register/refresh.
// "token" se mantiene igual al access token por compatibilidad con el frontend existente.
func (h *AuthHandler) issueTokens(user *domain.User) (gin.H, error) {
	accessToken, _, _, err := h.generateToken(user, "access", h.accessExpires)
	if err != nil {
		return nil, fmt.Errorf("access token: %w", err)
	}
	refreshToken, _, _, err := h.generateToken(user, "refresh", h.refreshExpires)
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	return gin.H{
		"token":        accessToken,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user":         user,
	}, nil
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
// tokenType es "access" (para llamar a la API) o "refresh" (solo para POST /auth/refresh).
func (h *AuthHandler) generateToken(user *domain.User, tokenType string, duration time.Duration) (string, time.Time, string, error) {
	jti, err := generateJTI()
	if err != nil {
		return "", time.Time{}, "", err
	}

	now := time.Now()
	exp := now.Add(duration)

	claims := jwt.MapClaims{
		"jti":   jti,
		"id":    user.ID,
		"email": user.Email,
		"role":  string(user.Role),
		"type":  tokenType,
		"exp":   exp.Unix(),
		"iat":   now.Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := t.SignedString([]byte(h.jwtSecret))
	if err != nil {
		return "", time.Time{}, "", err
	}
	return signed, exp, jti, nil
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

	// Hash de contraseña con bcrypt (cost 12)
	hash, err := security.HashPassword(body.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	resp, err := h.issueTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar tokens"})
		return
	}

	resp["data"] = gin.H{
		"token": resp["token"],
		"user":  resp["user"],
	}
	c.JSON(http.StatusCreated, resp)
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
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "Usuario inactivo",
			"message": "Usuario inactivo. Contacta al administrador",
		})
		return
	}

	if !security.ComparePassword(body.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales inválidas"})
		return
	}

	resp, err := h.issueTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar tokens"})
		return
	}

	resp["data"] = gin.H{
		"token": resp["token"],
		"user":  resp["user"],
	}
	c.JSON(http.StatusOK, resp)
}

// Refresh godoc
// POST /api/v1/auth/refresh
//
// Recibe un Refresh Token válido, lo revoca (rotación: cada refresh token
// sirve una sola vez) y genera un nuevo Access Token y un nuevo Refresh Token.
func (h *AuthHandler) Refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refreshToken es requerido"})
		return
	}

	// Parsear y verificar firma del Refresh Token
	parsed, err := jwt.Parse(body.RefreshToken, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("método de firma inválido")
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !parsed.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token inválido o expirado"})
		return
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Claims inválidos"})
		return
	}

	// Verificar que sea realmente un Refresh Token
	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "refresh" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "El token no es un refresh token"})
		return
	}

	// Obtener JTI
	jti, ok := claims["jti"].(string)
	if !ok || jti == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token sin JTI"})
		return
	}

	// Verificar si ya fue utilizado/revocado (fail-closed, igual que el middleware)
	revoked, err := h.revStore.IsRevoked(jti)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "No se pudo verificar el estado del token, intenta nuevamente"})
		return
	}
	if revoked {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token ya utilizado o revocado"})
		return
	}

	// Obtener id del usuario
	userID, ok := claims["id"].(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token sin usuario"})
		return
	}

	// Buscar el usuario nuevamente (pudo cambiar de rol o desactivarse)
	user, err := h.userRepo.FindByID(c.Request.Context(), userID)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no encontrado"})
		return
	}

	// No permitir refrescar una cuenta desactivada
	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cuenta desactivada"})
		return
	}

	// Obtener expiración del Refresh Token
	expFloat, ok := claims["exp"].(float64)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token sin expiración"})
		return
	}

	exp := time.Unix(int64(expFloat), 0)

	// ROTACIÓN: el Refresh Token que acaba de utilizarse queda invalidado
	if err := h.revStore.Revoke(jti, exp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo rotar el refresh token, intenta nuevamente"})
		return
	}

	resp, err := h.issueTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar tokens"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Logout godoc
// POST /api/v1/auth/logout — requiere middleware Authenticate
// Revoca el token actual en el RevocationStore hasta su expiración.
// Si el body trae {"refreshToken": "..."}, también se revoca, para que no
// pueda usarse en /auth/refresh después de cerrar sesión.
func (h *AuthHandler) Logout(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	_ = c.ShouldBindJSON(&body) // body opcional
	if body.RefreshToken != "" {
		if jti, exp, err := parseJTIAndExp(body.RefreshToken); err == nil {
			if revokeErr := h.revStore.Revoke(jti, exp); revokeErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cerrar la sesión, intenta nuevamente"})
				return
			}
		}
	}

	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada correctamente"})
		return
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	// Parsear sin verificar nuevamente (el middleware ya lo hizo)
	jti, exp, err := parseJTIAndExp(tokenStr)
	if err == nil {
		if revokeErr := h.revStore.Revoke(jti, exp); revokeErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cerrar la sesión, intenta nuevamente"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada correctamente"})
}

// Revoke godoc
// POST /api/v1/auth/revoke — requiere rol ADMIN
// Revoca dinámicamente el token entregado en el body, sin esperar a que el
// propio usuario cierre sesión (p.ej. cuenta comprometida, cambio de rol).
// Al apoyarse en el RevocationStore compartido (Redis en el cluster), la
// revocación es visible de inmediato en todas las réplicas del backend.
func (h *AuthHandler) Revoke(c *gin.Context) {
	var body struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	jti, exp, err := parseJTIAndExp(body.Token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token inválido o sin los claims requeridos"})
		return
	}

	if err := h.revStore.Revoke(jti, exp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo revocar el token, intenta nuevamente"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Token revocado correctamente"})
}

// parseJTIAndExp extrae los claims "jti" y "exp" de un JWT sin verificar su
// firma (solo se usa para identificar qué revocar; la validez del token ya
// fue o será comprobada por separado en el middleware Authenticate).
func parseJTIAndExp(tokenStr string) (jti string, exp time.Time, err error) {
	p := jwt.NewParser()
	parsed, _, err := p.ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return "", time.Time{}, err
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", time.Time{}, fmt.Errorf("token malformado")
	}
	jti, _ = claims["jti"].(string)
	expFloat, _ := claims["exp"].(float64)
	if jti == "" || expFloat <= 0 {
		return "", time.Time{}, fmt.Errorf("token sin claims jti/exp válidos")
	}
	return jti, time.Unix(int64(expFloat), 0), nil
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
