package main

import (
	"fmt"
	"log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/router"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
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

	// ── Servicio y handler de ocupación (sin BD — lógica pura) ──────────────
	// Para conectar el clúster ML en el futuro:
	//   occupancySvc.SetPredictor(service.NewMLClusterPredictor(clusterURL, apiKey))
	occupancySvc := service.NewOccupancyService()
	occupancyH := handler.NewOccupancyHandler(occupancySvc)

	climateClient, err := grpcclient.NewClimateClient(cfg.ClimateGRPCTarget, cfg.ClimateAPIKey, cfg.GRPCTimeout)
	if err != nil {
		log.Fatalf("❌ Error al conectar con clima_service por gRPC: %v", err)
	}
	defer climateClient.Close()
	microClient, err := grpcclient.NewMicroClient(cfg.MicroGRPCTarget, cfg.MicroAPIKey, cfg.GRPCTimeout)
	if err != nil {
		log.Fatalf("❌ Error al conectar con micro_service por gRPC: %v", err)
	}
	defer microClient.Close()
	grpcProxyH := handler.NewGRPCProxyHandler(climateClient, microClient)

	// ── Router ────────────────────────────────────────────────
	r := router.Setup(cfg.CORSOrigin, cfg.JWTSecret, blacklist, authH, userH, busH, routeH, complaintH, occupancyH, grpcProxyH)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("\n🚌  Servidor Go corriendo en http://localhost%s\n", addr)
	fmt.Printf("🌍  Entorno: %s\n\n", cfg.Env)

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Error al iniciar servidor: %v", err)
	}
}
