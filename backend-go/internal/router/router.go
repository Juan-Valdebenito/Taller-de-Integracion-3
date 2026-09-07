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
	bl *token.Blacklist,
	authH *handler.AuthHandler,
	userH *handler.UserHandler,
	busH *handler.BusHandler,
	routeH *handler.RouteHandler,
	complaintH *handler.ComplaintHandler,
	occupancyH *handler.OccupancyHandler,
) *gin.Engine {
	r := gin.Default()
	metrics := middleware.NewMetrics()
	r.Use(metrics.CollectHTTP())

	// ── CORS ──────────────────────────────────────────────────
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{corsOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// ── Health check ──────────────────────────────────────────
	// Endpoints de infraestructura: sin autenticacion para probes de Kubernetes.
	// /health se conserva como alias por compatibilidad con clientes existentes.
	r.GET("/health", middleware.Healthz)
	r.GET("/healthz", middleware.Healthz)
	r.GET("/readyz", middleware.Readyz(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return pool.Ping(ctx)
	}))
	r.GET("/metrics", metrics.Prometheus)

	// ── API v1 ────────────────────────────────────────────────
	api := r.Group("/api/v1")

	// Ocupación (público — sin auth para facilitar integración con dispositivos)
	api.POST("/occupancy", occupancyH.Predict)

	// Alias del middleware para mayor legibilidad
	auth := func() gin.HandlerFunc { return middleware.Authenticate(jwtSecret, bl) }

	// Auth (público excepto /logout y /me que requieren token válido)
	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", authH.Register)
		authGroup.POST("/login", authH.Login)
		authGroup.POST("/logout", auth(), authH.Logout)
		authGroup.GET("/me", auth(), authH.Me)
	}

	// Usuarios (requiere autenticación; operaciones de admin requieren rol)
	users := api.Group("/users", auth())
	{
		users.GET("/", middleware.Authorize("ADMIN"), userH.GetAll)
		users.GET("/:id", userH.GetByID)
		users.PUT("/:id", middleware.Authorize("ADMIN"), userH.Update)
		users.DELETE("/:id", middleware.Authorize("ADMIN"), userH.Delete)
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

	// Reclamos
	complaints := api.Group("/complaints", auth())
	{
		complaints.GET("/", middleware.Authorize("ADMIN", "COMPANY"), complaintH.GetAll)
		complaints.GET("/:id", complaintH.GetByID)
		complaints.POST("/", middleware.Authorize("PASSENGER"), complaintH.Create)
		complaints.PUT("/:id/status", middleware.Authorize("ADMIN", "COMPANY"), complaintH.UpdateStatus)
		complaints.DELETE("/:id", middleware.Authorize("ADMIN"), complaintH.Delete)
	}

	return r
}
