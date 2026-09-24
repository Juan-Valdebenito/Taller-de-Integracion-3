package main

import (
	"context"
	"fmt"
	"log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
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

	// ── Auto-migración y Seeder en entorno de desarrollo ───────
	if err := db.AutoMigrateAndSeed(context.Background(), pool, cfg.Env); err != nil {
		log.Printf("⚠️  Error durante auto-migración/seeder: %v", err)
	}

	// ── Token blacklist (logout seguro) ───────────────────────
	blacklist := token.NewBlacklist()

	// ── Repositorios ─────────────────────────────────────────
	userRepo := repository.NewUserRepository(pool)
	busRepo := repository.NewBusRepository(pool)
	routeRepo := repository.NewRouteRepository(pool)
	complaintRepo := repository.NewComplaintRepository(pool)
	recaudoRepo := repository.NewRecaudoRepository(pool)

	// ── Servicios ─────────────────────────────────────────────
	occupancySvc := service.NewOccupancyService()
	aforoSvc := service.NewAforoService(pool)

	// ── Handlers ──────────────────────────────────────────────
	authH := handler.NewAuthHandler(userRepo, cfg.JWTSecret, blacklist)
	userH := handler.NewUserHandler(userRepo)
	busH := handler.NewBusHandler(busRepo)
	routeH := handler.NewRouteHandler(routeRepo, busRepo)
	complaintH := handler.NewComplaintHandler(complaintRepo)
	occupancyH := handler.NewOccupancyHandler(occupancySvc)
	aforoH := handler.NewAforoHandler(aforoSvc)
	recaudoH := handler.NewRecaudoHandler(recaudoRepo, aforoSvc)

	// ── Router ────────────────────────────────────────────────
	r := router.Setup(
		cfg.CORSOrigin,
		cfg.JWTSecret,
		blacklist,
		authH,
		userH,
		busH,
		routeH,
		complaintH,
		occupancyH,
		aforoH,
		recaudoH,
	)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("\n🚌  Servidor Go corriendo en http://localhost%s\n", addr)
	fmt.Printf("🌍  Entorno: %s\n\n", cfg.Env)

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Error al iniciar servidor: %v", err)
	}
}
