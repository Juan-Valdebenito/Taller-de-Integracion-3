package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// Setup configura y retorna el router Gin con todas las rutas registradas.
func Setup(
	corsOrigin string,
	jwtSecret string,
	bl *token.Blacklist,
	authH *handler.AuthHandler,
	userH *handler.UserHandler,
	busH *handler.BusHandler,
	routeH *handler.RouteHandler,
	complaintH *handler.ComplaintHandler,
	occupancyH *handler.OccupancyHandler,
	aforoH *handler.AforoHandler,
	recaudoH *handler.RecaudoHandler,
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

	// Alias del middleware para mayor legibilidad
	auth := func() gin.HandlerFunc { return middleware.Authenticate(jwtSecret, bl) }
	optionalAuth := func() gin.HandlerFunc { return middleware.OptionalAuthenticate(jwtSecret, bl) }

	// Ocupación heurística / ML (público)
	api.POST("/occupancy", occupancyH.Predict)

	// Control y cálculo estricto de aforo vehicular
	aforo := api.Group("/aforo")
	{
		aforo.POST("/calculate", aforoH.CalculateStrict)
		aforo.GET("/bus/:id", aforoH.GetBusAforo)
		aforo.POST("/bus/:id/flow", aforoH.ProcessFlow)
	}

	// Transacciones de recaudo (Bipay / Escolar / Adulto Mayor)
	recaudo := api.Group("/recaudo", middleware.SensitiveDataMasker())
	{
		recaudo.POST("/transactions", recaudoH.CreateTransaction)
		recaudo.GET("/transactions", recaudoH.ListTransactions)
		recaudo.GET("/summary", recaudoH.GetSummary)
	}

	// Auth (con validación estricta y sanitización de entrada)
	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", middleware.ValidateUserPayload(), authH.Register)
		authGroup.POST("/login", authH.Login)
		authGroup.POST("/logout", auth(), authH.Logout)
		authGroup.GET("/me", auth(), authH.Me)
	}

	// Usuarios (con soporte de máscara ?mask=true para privacidad y validación en updates)
	users := api.Group("/users", auth(), middleware.SensitiveDataMasker())
	{
		users.GET("", middleware.Authorize("ADMIN"), userH.GetAll)
		users.GET("/", middleware.Authorize("ADMIN"), userH.GetAll)
		users.GET("/:id", userH.GetByID)
		users.PUT("/:id", middleware.Authorize("ADMIN"), middleware.ValidateUserUpdatePayload(), userH.Update)
		users.DELETE("/:id", middleware.Authorize("ADMIN"), userH.Delete)
	}

	// Auditoría administrativa con enmascaramiento de datos sensibles (?mask=true)
	admin := api.Group("/admin", auth(), middleware.Authorize("ADMIN"), middleware.SensitiveDataMasker())
	{
		admin.GET("/audit", func(c *gin.Context) {
			// Retorna eventos de auditoría administrativa con campos sensibles protegidos
			c.JSON(200, gin.H{
				"success": true,
				"auditTrail": []gin.H{
					{
						"id":        "aud-001",
						"action":    "USER_UPDATE",
						"adminUser": "admin@transporte.cl",
						"targetUser": "juan.perez@transporte.cl",
						"phone":     "+56912345678",
						"rut":       "12.345.678-9",
						"timestamp": "2026-09-24T12:00:00Z",
					},
					{
						"id":        "aud-002",
						"action":    "FARE_TRANSACTION_RECONCILE",
						"adminUser": "admin@transporte.cl",
						"cardUid":   "BIP-99887766",
						"timestamp": "2026-09-24T13:30:00Z",
					},
				},
			})
		})
	}

	// Buses
	buses := api.Group("/buses", auth())
	{
		buses.GET("/", busH.GetAll)
		buses.GET("/:id", busH.GetByID)
		buses.GET("/:id/location", busH.GetLocation)
		buses.POST("/", middleware.Authorize("ADMIN", "COMPANY"), busH.Create)
		buses.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), busH.Update)
		buses.DELETE("/:id", middleware.Authorize("ADMIN"), busH.Delete)
	}

	// Rutas de transporte
	routes := api.Group("/routes", auth())
	{
		routes.GET("/", routeH.GetAll)
		routes.GET("/:id", routeH.GetByID)
		routes.GET("/:id/stops", routeH.GetStops)
		routes.GET("/:id/buses", routeH.GetBuses)
		routes.POST("/", middleware.Authorize("ADMIN"), routeH.Create)
		routes.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), routeH.Update)
		routes.DELETE("/:id", middleware.Authorize("ADMIN"), routeH.Delete)
	}

	// Reclamos con validación y sanitización estricta XSS
	api.POST("/complaints", optionalAuth(), middleware.ValidateComplaintPayload(), complaintH.Create)
	api.POST("/complaints/", optionalAuth(), middleware.ValidateComplaintPayload(), complaintH.Create)

	complaints := api.Group("/complaints", auth())
	{
		complaints.GET("", middleware.Authorize("ADMIN", "COMPANY"), complaintH.GetAll)
		complaints.GET("/", middleware.Authorize("ADMIN", "COMPANY"), complaintH.GetAll)
		complaints.GET("/:id", complaintH.GetByID)
		complaints.PUT("/:id/status", middleware.Authorize("ADMIN", "COMPANY"), complaintH.UpdateStatus)
		complaints.DELETE("/:id", middleware.Authorize("ADMIN"), complaintH.Delete)
	}

	return r
}
