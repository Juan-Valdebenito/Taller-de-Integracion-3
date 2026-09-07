package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

const (
	// ContextUserID es la clave usada para el ID de usuario en el contexto Gin.
	ContextUserID    = "userID"
	ContextUserEmail = "userEmail"
	ContextUserRole  = "userRole"
	// ContextJTI es la clave del JWT ID inyectado en el contexto (útil para audit logs).
	ContextJTI = "jti"
)

// Authenticate verifica el token Bearer JWT, comprueba que no esté revocado,
// y lo inyecta en el contexto de Gin.
func Authenticate(jwtSecret string, bl *token.Blacklist) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token de autenticación requerido"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		t, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !t.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token inválido o expirado"})
			return
		}

		claims, ok := t.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token malformado"})
			return
		}

		// Verificar que el token no haya sido revocado (logout)
		jti, _ := claims["jti"].(string)
		if jti == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token sin identificador (jti) requerido"})
			return
		}
		if bl.IsRevoked(jti) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "El token ha sido revocado. Por favor inicia sesión nuevamente"})
			return
		}

		// Cast explícito a string para evitar fallos de tipo en Authorize
		userID, _ := claims["id"].(string)
		userEmail, _ := claims["email"].(string)
		userRole, _ := claims["role"].(string)

		c.Set(ContextUserID, userID)
		c.Set(ContextUserEmail, userEmail)
		c.Set(ContextUserRole, userRole)
		c.Set(ContextJTI, jti)
		c.Next()
	}
}

// Authorize verifica que el rol del usuario autenticado sea uno de los permitidos.
func Authorize(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get(ContextUserRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No autenticado"})
			return
		}

		// Cast seguro: el middleware Authenticate ya garantiza que es string
		role, ok := roleVal.(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Rol de usuario inválido"})
			return
		}

		for _, r := range roles {
			if r == role {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "No tienes permisos para realizar esta acción"})
	}
}
