// Servidor minimo para pruebas de carga de endpoints publicos.
// Solo expone /health y /api/v1/occupancy sin conexion a base de datos.
// Uso: go run ./tests/load/mockserver/
package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
	}))

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "lang": "go", "mode": "load-test-mock"})
	})

	// Ocupacion (logica pura, sin BD)
	occupancySvc := service.NewOccupancyService()
	occupancyH := handler.NewOccupancyHandler(occupancySvc)
	api := r.Group("/api/v1")
	api.POST("/occupancy", occupancyH.Predict)

	// Auth/login mock — retorna 401 (para medir ese endpoint)
	api.POST("/auth/login", func(c *gin.Context) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales invalidas"})
	})

	port := "3001"
	fmt.Printf("\n Servidor mock corriendo en http://localhost:%s\n", port)
	fmt.Printf("   Endpoints: /health, /api/v1/occupancy, /api/v1/auth/login\n\n")
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Error al iniciar servidor mock: %v", err)
	}
}
