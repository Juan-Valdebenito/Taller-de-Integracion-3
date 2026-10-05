package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/router"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/seed"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

func main() {
	// ── Configuración ─────────────────────────────────────────
	cfg := config.Load()

	// ── Migraciones de base de datos ───────────────────────────
	db.RunMigrations(cfg.DatabaseURL)

	// ── Base de datos ─────────────────────────────────────────
	pool := db.NewPool(cfg.DatabaseURL)
	defer pool.Close()

	// ── Auto-migración y Seeder en entorno de desarrollo ───────
	if err := db.AutoMigrateAndSeed(context.Background(), pool, cfg.Env); err != nil {
		log.Printf("⚠️  Error durante auto-migración/seeder: %v", err)
	}

	// ── Datos de prueba adicionales (solo fuera de producción) ──
	if cfg.Env != "production" {
		if err := seed.Run(context.Background(), pool); err != nil {
			log.Printf("⚠️  No se pudieron crear los datos de prueba: %v\n", err)
		}
	}

	// ── Token revocation store (logout seguro / revocación dinámica) ──
	revStore, err := token.NewStore(token.StoreOptions{
		RedisAddr:     cfg.RedisAddr,
		RedisPassword: cfg.RedisPassword,
		RedisDB:       cfg.RedisDB,
	})
	if err != nil {
		log.Fatalf("❌ Error al inicializar el almacén de revocación de tokens: %v", err)
	}
	defer revStore.Close()

	// ── Repositorios ─────────────────────────────────────────
	userRepo := repository.NewUserRepository(pool)
	companyRepo := repository.NewCompanyRepository(pool)
	busRepo := repository.NewBusRepository(pool)
	routeRepo := repository.NewRouteRepository(pool)
	stopRepo := repository.NewStopRepository(pool)
	complaintRepo := repository.NewComplaintRepository(pool)
	recaudoRepo := repository.NewRecaudoRepository(pool)

	// ── Servicios ─────────────────────────────────────────────
	occupancySvc := service.NewOccupancyService()
	aforoSvc := service.NewAforoService(pool)

	// ── Conectar predictor ML si está configurado ──────────────────────────────
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

	// ── Handlers ──────────────────────────────────────────────
	authH := handler.NewAuthHandler(userRepo, cfg.JWTSecret, cfg.JWTAccessExpires, cfg.JWTRefreshExpires, revStore)
	userH := handler.NewUserHandler(userRepo)
	companyH := handler.NewCompanyHandler(companyRepo)
	busH := handler.NewBusHandler(busRepo)
	routeH := handler.NewRouteHandler(routeRepo, busRepo)
	stopH := handler.NewStopHandler(stopRepo)
	complaintH := handler.NewComplaintHandler(complaintRepo, busRepo, routeRepo)
	occupancyH := handler.NewOccupancyHandler(occupancySvc)
	aforoH := handler.NewAforoHandler(aforoSvc)
	recaudoH := handler.NewRecaudoHandler(recaudoRepo, aforoSvc)
	healthH := handler.NewHealthHandler(pool)

	// Conexión gRPC clientes de clima y micro
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
	r := router.Setup(
		cfg.CORSOrigin,
		cfg.JWTSecret,
		pool,
		revStore,
		authH,
		companyH,
		userH,
		busH,
		routeH,
		stopH,
		complaintH,
		occupancyH,
		grpcProxyH,
		aforoH,
		recaudoH,
		healthH,
	)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("\n🚌  Servidor Go corriendo en http://localhost%s\n", addr)
	fmt.Printf("🌍  Entorno: %s\n\n", cfg.Env)

	// Iniciar listener secundario en :8080 si no es el puerto principal
	if cfg.Port != "8080" {
		go func() {
			fmt.Printf("📡  Listener dual activo en http://localhost:8080\n")
			_ = r.Run(":8080")
		}()
	}

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Error al iniciar servidor: %v", err)
	}
}
