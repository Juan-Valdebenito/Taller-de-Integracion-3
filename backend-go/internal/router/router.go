package router

import (
	"context"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// Setup configura y retorna el router Gin con todas las rutas registradas.
func Setup(
	corsOrigin string,
	jwtSecret string,
	pool *pgxpool.Pool,
	revStore token.RevocationStore,
	authH *handler.AuthHandler,
	companyH *handler.CompanyHandler,
	userH *handler.UserHandler,
	busH *handler.BusHandler,
	routeH *handler.RouteHandler,
	stopH *handler.StopHandler,
	complaintH *handler.ComplaintHandler,
	occupancyH *handler.OccupancyHandler,
	grpcH *handler.GRPCProxyHandler,
	aforoH *handler.AforoHandler,
	recaudoH *handler.RecaudoHandler,
	healthH *handler.HealthHandler,
) *gin.Engine {
	r := gin.Default()
	metrics := middleware.NewMetrics()
	r.Use(metrics.CollectHTTP())

	// ── CORS ──────────────────────────────────────────────────
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{corsOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// ── Health checks & Kubernetes Probes ─────────────────────
	// Endpoints de infraestructura: sin autenticación para probes de Kubernetes.
	// /health se conserva como alias por compatibilidad.
	r.GET("/health", middleware.Healthz)
	r.GET("/healthz", middleware.Healthz)
	r.GET("/readyz", middleware.Readyz(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if pool != nil {
			return pool.Ping(ctx)
		}
		return nil
	}))
	r.GET("/metrics", metrics.Prometheus())

	// ── API v1 ────────────────────────────────────────────────
	api := r.Group("/api/v1")

	// Alias del middleware para mayor legibilidad
	auth := func() gin.HandlerFunc { return middleware.Authenticate(jwtSecret, revStore) }
	optionalAuth := func() gin.HandlerFunc { return middleware.OptionalAuthenticate(jwtSecret, revStore) }

	// Ocupación (público — sin auth para facilitar integración con dispositivos)
	api.POST("/occupancy", occupancyH.Predict)

	// Simulación de sensores/pagos (público — fallback REST del panel DevTools)
	api.POST("/buses/simulate-event", busH.SimulateEvent)

	// Control y cálculo estricto de aforo vehicular
	if aforoH != nil {
		aforo := api.Group("/aforo")
		{
			aforo.POST("/calculate", aforoH.CalculateStrict)
			aforo.GET("/bus/:id", aforoH.GetBusAforo)
			aforo.POST("/bus/:id/flow", aforoH.ProcessFlow)
		}
	}

	// Transacciones de recaudo (Bipay / Escolar / Adulto Mayor)
	if recaudoH != nil {
		recaudo := api.Group("/recaudo", middleware.SensitiveDataMasker())
		{
			recaudo.POST("/transactions", recaudoH.CreateTransaction)
			recaudo.GET("/transactions", recaudoH.ListTransactions)
			recaudo.GET("/summary", recaudoH.GetSummary)
		}
	}

	// Proxies gRPC hacia los microservicios de clima y transporte de micros
	if grpcH != nil {
		grpcGroup := api.Group("/integrations", auth())
		{
			grpcGroup.GET("/climate/telemetry", grpcH.ListTelemetry)
			grpcGroup.GET("/micro/stops", grpcH.ListStops)
			grpcGroup.GET("/micro/stops/:id", grpcH.GetStop)
			grpcGroup.GET("/micro/routes", grpcH.ListRoutes)
			grpcGroup.GET("/micro/routes/plan", grpcH.PlanRoute)
		}
	}

	// Auth (con validación estricta y sanitización de entrada)
	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", middleware.ValidateUserPayload(), authH.Register)
		authGroup.POST("/login", authH.Login)
		authGroup.POST("/refresh", authH.Refresh)
		authGroup.POST("/logout", auth(), authH.Logout)
		authGroup.GET("/me", auth(), authH.Me)
		authGroup.POST("/revoke", auth(), middleware.Authorize("ADMIN"), authH.Revoke)
	}

	// Usuarios (con soporte de máscara ?mask=true para privacidad y validación en updates)
	users := api.Group("/users", optionalAuth(), middleware.SensitiveDataMasker())
	{
		users.GET("", userH.GetAll)
		users.GET("/", userH.GetAll)
		users.GET("/:id", userH.GetByID)
		users.PUT("/:id", middleware.ValidateUserUpdatePayload(), userH.Update)
		users.PATCH("/:id", middleware.ValidateUserUpdatePayload(), userH.Patch)
		users.DELETE("/:id", userH.Delete)
	}

	// Empresas (requiere autenticación; operaciones de admin requieren rol)
	if companyH != nil {
		companies := api.Group("/companies", auth())
		{
			companies.GET("", middleware.Authorize("ADMIN"), companyH.GetAll)
			companies.GET("/", middleware.Authorize("ADMIN"), companyH.GetAll)
		}
	}

	// Auditoría administrativa con enmascaramiento de datos sensibles (?mask=true)
	admin := api.Group("/admin", auth(), middleware.Authorize("ADMIN"), middleware.SensitiveDataMasker())
	{
		admin.GET("/audit", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"success": true,
				"auditTrail": []gin.H{
					{
						"id":         "aud-001",
						"action":     "USER_UPDATE",
						"adminUser":  "admin@transporte.cl",
						"targetUser": "juan.perez@transporte.cl",
						"phone":      "+56912345678",
						"rut":        "12.345.678-9",
						"timestamp":  "2026-09-24T12:00:00Z",
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

	// Buses (CRUD de micros con soporte para PATCH y roles ADMIN/COMPANY)
	buses := api.Group("/buses", optionalAuth())
	{
		buses.GET("", busH.GetAll)
		buses.GET("/", busH.GetAll)
		buses.GET("/:id", busH.GetByID)
		buses.GET("/:id/location", busH.GetLocation)
		buses.POST("", middleware.Authorize("ADMIN", "COMPANY"), busH.Create)
		buses.POST("/", middleware.Authorize("ADMIN", "COMPANY"), busH.Create)
		buses.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), busH.Update)
		buses.PATCH("/:id", middleware.Authorize("ADMIN", "COMPANY"), busH.Patch)
		buses.DELETE("/:id", middleware.Authorize("ADMIN", "COMPANY"), busH.Delete)
	}

	// Rutas de transporte
	routes := api.Group("/routes", auth())
	{
		routes.GET("", routeH.GetAll)
		routes.GET("/", routeH.GetAll)
		routes.GET("/:id", routeH.GetByID)
		routes.GET("/:id/stops", routeH.GetStops)
		routes.GET("/:id/buses", routeH.GetBuses)
		routes.POST("/", middleware.Authorize("ADMIN"), routeH.Create)
		routes.PUT("/:id", middleware.Authorize("ADMIN", "COMPANY"), routeH.Update)
		routes.DELETE("/:id", middleware.Authorize("ADMIN"), routeH.Delete)
	}

	// Paraderos (solo administración)
	if stopH != nil {
		stops := api.Group("/stops", auth())
		{
			stops.GET("/:id", stopH.GetByID)
			stops.POST("/", middleware.Authorize("ADMIN"), stopH.Create)
			stops.PUT("/:id", middleware.Authorize("ADMIN"), stopH.Update)
			stops.DELETE("/:id", middleware.Authorize("ADMIN"), stopH.Delete)
		}
	}

	// Reclamos: creación accesible por pasajeros con validación y sanitización estricta XSS
	api.POST("/complaints", optionalAuth(), middleware.ValidateComplaintPayload(), complaintH.Create)
	api.POST("/complaints/", optionalAuth(), middleware.ValidateComplaintPayload(), complaintH.Create)

	// Gestión y consulta de reclamos con soporte de enmascaramiento (?mask=true)
	complaints := api.Group("/complaints", optionalAuth(), middleware.SensitiveDataMasker())
	{
		complaints.GET("/stats", complaintH.GetStats)
		complaints.GET("", complaintH.GetAll)
		complaints.GET("/", complaintH.GetAll)
		complaints.GET("/my", middleware.Authorize("PASSENGER"), complaintH.GetMine)
		complaints.GET("/my-complaints", middleware.Authorize("PASSENGER"), complaintH.FindByPassengerID)
		complaints.GET("/:id", complaintH.GetByID)
		complaints.PUT("/:id/status", middleware.Authorize("ADMIN", "COMPANY"), complaintH.UpdateStatus)
		complaints.PATCH("/:id/status", middleware.Authorize("ADMIN", "COMPANY"), complaintH.UpdateStatus)
		complaints.DELETE("/:id", middleware.Authorize("ADMIN"), complaintH.Delete)
	}

	return r
}
