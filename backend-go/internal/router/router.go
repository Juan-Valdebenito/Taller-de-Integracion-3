package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// Setup configura y retorna el router Gin con todas las rutas registradas.
func Setup(
	corsOrigin string,
	jwtSecret string,
	authH *handler.AuthHandler,
	userH *handler.UserHandler,
	busH *handler.BusHandler,
	routeH *handler.RouteHandler,
	complaintH *handler.ComplaintHandler,
) *gin.Engine {
	r := gin.Default()

	// ── CORS ──────────────────────────────────────────────────
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{corsOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// ── Health check ──────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "lang": "go"})
	})

	// ── API v1 ────────────────────────────────────────────────
	api := r.Group("/api/v1")

	// Auth (público)
	auth := api.Group("/auth")
	{
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
		auth.POST("/logout", authH.Logout)
		auth.GET("/me", middleware.Authenticate(jwtSecret), authH.Me)
	}

	// Usuarios (requiere autenticación; operaciones de admin requieren rol)
	users := api.Group("/users", middleware.Authenticate(jwtSecret))
	{
		users.GET("/", middleware.Authorize("ADMIN"), userH.GetAll)
		users.GET("/:id", userH.GetByID)
		users.PUT("/:id", middleware.Authorize("ADMIN"), userH.Update)
		users.DELETE("/:id", middleware.Authorize("ADMIN"), userH.Delete)
	}

	// Buses
	buses := api.Group("/buses", middleware.Authenticate(jwtSecret))
	{
		buses.GET("/", busH.GetAll)
		buses.GET("/:id", busH.GetByID)
		buses.GET("/:id/location", busH.GetLocation)
		buses.POST("/", middleware.Authorize("ADMIN", "COMPANY"), busH.Create)
		buses.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), busH.Update)
		buses.DELETE("/:id", middleware.Authorize("ADMIN"), busH.Delete)
	}

	// Rutas de transporte
	routes := api.Group("/routes", middleware.Authenticate(jwtSecret))
	{
		routes.GET("/", routeH.GetAll)
		routes.GET("/:id", routeH.GetByID)
		routes.GET("/:id/stops", routeH.GetStops)
		routes.GET("/:id/buses", routeH.GetBuses)
		routes.POST("/", middleware.Authorize("ADMIN"), routeH.Create)
		routes.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), routeH.Update)
		routes.DELETE("/:id", middleware.Authorize("ADMIN"), routeH.Delete)
	}

	// Reclamos
	complaints := api.Group("/complaints", middleware.Authenticate(jwtSecret))
	{
		complaints.GET("/", middleware.Authorize("ADMIN", "COMPANY"), complaintH.GetAll)
		complaints.GET("/:id", complaintH.GetByID)
		complaints.POST("/", middleware.Authorize("PASSENGER"), complaintH.Create)
		complaints.PUT("/:id/status", middleware.Authorize("ADMIN", "COMPANY"), complaintH.UpdateStatus)
		complaints.DELETE("/:id", middleware.Authorize("ADMIN"), complaintH.Delete)
	}

	return r
}
