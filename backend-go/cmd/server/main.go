package main

import (
	"fmt"
	"log"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/router"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

func main() {
	// ── Configuración ─────────────────────────────────────────
	cfg := config.Load()

	// ── Base de datos ─────────────────────────────────────────
	pool := db.NewPool(cfg.DatabaseURL)
	defer pool.Close()

	// ── Token blacklist (logout seguro) ───────────────────────
	blacklist := token.NewBlacklist()

	// ── Repositorios ─────────────────────────────────────────
	userRepo := repository.NewUserRepository(pool)
	busRepo := repository.NewBusRepository(pool)
	routeRepo := repository.NewRouteRepository(pool)
	complaintRepo := repository.NewComplaintRepository(pool)

	// ── Handlers ──────────────────────────────────────────────
	authH := handler.NewAuthHandler(userRepo, cfg.JWTSecret, blacklist)
	userH := handler.NewUserHandler(userRepo)
	busH := handler.NewBusHandler(busRepo)
	routeH := handler.NewRouteHandler(routeRepo, busRepo)
	complaintH := handler.NewComplaintHandler(complaintRepo)

	// ── Servicio de ocupación ──────────────────────────────────
	occupancySvc := service.NewOccupancyService()

	// ── Conectar predictor ML si está configurado ──────────────────────────────
	// Leer PREDICTION_TRANSPORT del entorno:
	//   "" (vacío) → usa HeuristicPredictor por defecto (sin cambios al comportamiento actual)
	//   "http"     → crea HTTPPredictionClient hacia PREDICTION_HTTP_URL
	//   "grpc"     → crea GRPCPredictionClient hacia PREDICTION_GRPC_ADDR
	if cfg.PredictionTransport != "" {
		predClient, err := transport.NewPredictionClient(transport.Config{
			Transport:  transport.TransportType(cfg.PredictionTransport),
			GRPCAddr:   cfg.PredictionGRPCAddr,
			HTTPURL:    cfg.PredictionHTTPURL,
			TimeoutSec: cfg.PredictionTimeoutSec,
		})
		if err != nil {
			log.Printf("⚠️  No se pudo conectar al servidor ML (%s): %v — usando predictor heurístico\n",
				cfg.PredictionTransport, err)
		} else {
			// Registrar cierre del cliente al finalizar el servidor
			defer func() {
				if closeErr := predClient.Close(); closeErr != nil {
					log.Printf("⚠️  Error cerrando cliente ML: %v\n", closeErr)
				}
			}()

			timeout := time.Duration(cfg.PredictionTimeoutSec) * time.Second
			mlPredictor := service.NewMLRemotePredictor(predClient, timeout)
			occupancySvc.SetPredictor(mlPredictor)

			fmt.Printf("🤖  Predictor ML activo: %s (%s)\n", mlPredictor.Name(), cfg.PredictionTransport)
		}
	} else {
		fmt.Printf("🔮  Predictor heurístico activo (PREDICTION_TRANSPORT no configurado)\n")
	}

	occupancyH := handler.NewOccupancyHandler(occupancySvc)

	// ── Router ────────────────────────────────────────────────
	r := router.Setup(cfg.CORSOrigin, cfg.JWTSecret, pool, blacklist, authH, userH, busH, routeH, complaintH, occupancyH)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("\n🚌  Servidor Go corriendo en http://localhost%s\n", addr)
	fmt.Printf("🌍  Entorno: %s\n\n", cfg.Env)

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Error al iniciar servidor: %v", err)
	}
}
