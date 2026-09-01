package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	// ContextUserID es la clave usada para el ID de usuario en el contexto Gin.
	ContextUserID    = "userID"
	ContextUserEmail = "userEmail"
	ContextUserRole  = "userRole"
)

// Authenticate verifica el token Bearer JWT y lo inyecta en el contexto.
func Authenticate(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token de autenticación requerido"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token inválido o expirado"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token malformado"})
			return
		}

		c.Set(ContextUserID, claims["id"])
		c.Set(ContextUserEmail, claims["email"])
		c.Set(ContextUserRole, claims["role"])
		c.Next()
	}
}

// Authorize verifica que el rol del usuario autenticado sea uno de los permitidos.
func Authorize(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextUserRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No autenticado"})
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
