package handler

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// pushTokenStore lo implementa repository.PushTokenRepository.
type pushTokenStore interface {
	Save(ctx context.Context, userID, token, platform string) error
	DeleteForUser(ctx context.Context, userID, token string) (bool, error)
}

// PushTokenHandler registra el teléfono de la cuenta con sesión para recibir
// notificaciones push (Expo Push).
type PushTokenHandler struct {
	store pushTokenStore
}

func NewPushTokenHandler(store pushTokenStore) *PushTokenHandler {
	return &PushTokenHandler{store: store}
}

// expoPushToken: formato de los tokens de Expo, ExponentPushToken[...] o ExpoPushToken[...].
var expoPushToken = regexp.MustCompile(`^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,150}\]$`)

type pushTokenRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

// parsePushToken valida el cuerpo. withPlatform exige la plataforma (al registrar).
func parsePushToken(c *gin.Context, withPlatform bool) (pushTokenRequest, bool) {
	var req pushTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato JSON inválido"})
		return req, false
	}
	req.Token = strings.TrimSpace(req.Token)
	req.Platform = strings.ToLower(strings.TrimSpace(req.Platform))
	if !expoPushToken.MatchString(req.Token) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token de notificaciones inválido"})
		return req, false
	}
	if withPlatform && req.Platform != "ios" && req.Platform != "android" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Plataforma inválida. Valores permitidos: ios, android"})
		return req, false
	}
	return req, true
}

func sessionUserID(c *gin.Context) string {
	id, _ := c.Get(middleware.ContextUserID)
	s, _ := id.(string)
	return s
}

// Register godoc
// PUT /api/v1/me/push-token — guarda el token del teléfono para la cuenta con
// sesión. Es idempotente: registrarlo de nuevo solo lo actualiza.
func (h *PushTokenHandler) Register(c *gin.Context) {
	req, ok := parsePushToken(c, true)
	if !ok {
		return
	}
	if err := h.store.Save(c.Request.Context(), sessionUserID(c), req.Token, req.Platform); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo registrar el teléfono para notificaciones"})
		return
	}
	c.Status(http.StatusNoContent)
}

// Unregister godoc
// DELETE /api/v1/me/push-token — deja de enviar notificaciones a ese teléfono.
// Solo borra el token si es de la cuenta con sesión; si no estaba, igual 204.
func (h *PushTokenHandler) Unregister(c *gin.Context) {
	req, ok := parsePushToken(c, false)
	if !ok {
		return
	}
	if _, err := h.store.DeleteForUser(c.Request.Context(), sessionUserID(c), req.Token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo quitar el teléfono de las notificaciones"})
		return
	}
	c.Status(http.StatusNoContent)
}
