package main

import (
	"context"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/logger"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/router"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/seed"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/simulation"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

func main() {
	logger.Configure()

	// â”€â”€ ConfiguraciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	cfg := config.Load()

	// â”€â”€ Contexto global (para shutdown ordenado) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// â”€â”€ Base de datos (opcional en modo simulaciÃ³n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	// Cuando SIMULATION_ENABLED=true y la BD no estÃ¡ disponible,
	// el servidor arranca en modo degradado: solo WebSocket + simulaciÃ³n.
	// Los endpoints REST que requieren BD devolverÃ¡n 503.
	pool := db.NewPoolOptional(cfg.DatabaseURL)
	dbAvailable := pool != nil

	if dbAvailable {
		defer pool.Close()
	} else {
		log.Warn().Str("event", "degraded_mode").Msg("Database unavailable; running in simulation mode")
		if !cfg.SimulationEnabled {
			log.Fatal().Str("event", "startup_failed").Msg("Database unavailable and simulation is disabled")
		}
	}

	// â”€â”€ Datos de prueba (solo si hay BD y no es producciÃ³n) â”€â”€â”€â”€
	if dbAvailable && cfg.Env != "production" {
		if err := seed.Run(ctx, pool); err != nil {
			log.Warn().Err(err).Str("event", "seed_failed").Msg("Could not create seed data")
		}
	}

	// â”€â”€ Token revocation store (logout seguro / revocaciÃ³n dinÃ¡mica) â”€â”€
	// Si cfg.RedisAddr estÃ¡ vacÃ­o (aÃºn no hay Redis en el cluster), cae a un
	// almacÃ©n en memoria; una vez que exista el servicio compartido basta con
	// setear REDIS_ADDR para que la revocaciÃ³n sea consistente entre rÃ©plicas.
	revStore, err := token.NewStore(token.StoreOptions{
		RedisAddr:     cfg.RedisAddr,
		RedisPassword: cfg.RedisPassword,
		RedisDB:       cfg.RedisDB,
	})
	if err != nil {
		log.Fatal().Err(err).Str("event", "token_store_failed").Msg("Could not initialize token revocation store")
	}
	defer revStore.Close()

	// â”€â”€ Repositorios y Handlers (requieren BD) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	var (
		authH      *handler.AuthHandler
		companyH   *handler.CompanyHandler
		userH      *handler.UserHandler
		busH       *handler.BusHandler
		routeH     *handler.RouteHandler
		stopH      *handler.StopHandler
		complaintH *handler.ComplaintHandler
		recaudoH   *handler.RecaudoHandler
		healthH    *handler.HealthHandler
	)
	occupancySvc := service.NewOccupancyService()
	aforoSvc := service.NewAforoService(pool)

	if dbAvailable {
		userRepo := repository.NewUserRepository(pool)
		companyRepo := repository.NewCompanyRepository(pool)
		busRepo := repository.NewBusRepository(pool)
		routeRepo := repository.NewRouteRepository(pool)
		stopRepo := repository.NewStopRepository(pool)
		complaintRepo := repository.NewComplaintRepository(pool)
		recaudoRepo := repository.NewRecaudoRepository(pool)

		authH = handler.NewAuthHandler(userRepo, cfg.JWTSecret, cfg.JWTAccessExpires, cfg.JWTRefreshExpires, revStore)
		companyH = handler.NewCompanyHandler(companyRepo)
		userH = handler.NewUserHandler(userRepo)
		busH = handler.NewBusHandler(busRepo)
		routeH = handler.NewRouteHandler(routeRepo, busRepo)
		stopH = handler.NewStopHandler(stopRepo)
		complaintH = handler.NewComplaintHandler(complaintRepo, busRepo, routeRepo)
		recaudoH = handler.NewRecaudoHandler(recaudoRepo, aforoSvc)
		healthH = handler.NewHealthHandler(pool)
	}

	// ── Conectar predictor ML si está configurado ──────────────────────────────
	if cfg.PredictionTransport != "" {
		predClient, err := transport.NewPredictionClient(transport.Config{
			Transport:  transport.TransportType(cfg.PredictionTransport),
			GRPCAddr:   cfg.PredictionGRPCAddr,
			HTTPURL:    cfg.PredictionHTTPURL,
			TimeoutSec: cfg.PredictionTimeoutSec,
		})
		if err != nil {
			log.Warn().Err(err).Str("event", "prediction_client_failed").
				Str("transport", cfg.PredictionTransport).
				Msg("Could not connect to ML server; using heuristic predictor")
		} else {
			defer func() {
				if closeErr := predClient.Close(); closeErr != nil {
					log.Warn().Err(closeErr).Str("event", "prediction_client_close_failed").
						Msg("Could not close ML client")
				}
			}()
			timeout := time.Duration(cfg.PredictionTimeoutSec) * time.Second
			mlPredictor := service.NewMLRemotePredictor(predClient, timeout)
			occupancySvc.SetPredictor(mlPredictor)
			log.Info().Str("event", "prediction_client_ready").
				Str("predictor", mlPredictor.Name()).
				Str("transport", cfg.PredictionTransport).
				Msg("ML predictor active")
		}
	} else {
		log.Info().Str("event", "prediction_client_disabled").Msg("Heuristic predictor active")
	}

	occupancyH := handler.NewOccupancyHandler(occupancySvc)
	aforoH := handler.NewAforoHandler(aforoSvc)

	// Conexión gRPC clientes de clima y micro
	// â”€â”€ WebSocket Hub (Pub/Sub â€” no requiere BD) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	hub := ws.NewHub(occupancySvc)
	go hub.Run()

	wsHandler := ws.NewWSHandler(hub, cfg.JWTSecret, []string{cfg.CORSOrigin})
	log.Info().Str("event", "websocket_ready").Str("path", "/ws").Msg("WebSocket Pub/Sub active")

	// â”€â”€ SimulaciÃ³n GPS (buses virtuales rutas 7A, 7B, 1C) â”€â”€â”€â”€â”€
	if cfg.SimulationEnabled {
		simRunner := simulation.NewRunner(hub, simulation.RunnerConfig{
			TickDuration:    time.Duration(cfg.SimulationTickMs) * time.Millisecond,
			SpeedMultiplier: cfg.SimulationSpeedMultiplier,
		})
		go simRunner.Start(ctx)
		log.Info().Str("event", "simulation_started").
			Int("tick_ms", cfg.SimulationTickMs).
			Msg("GPS simulation active")
	} else {
		log.Info().Str("event", "simulation_disabled").Msg("GPS simulation disabled")
	}

	// â”€â”€ Router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	// ── Clientes gRPC hacia microservicios ─────────────────────────────────
	climateClient, err := grpcclient.NewClimateClient(cfg.ClimateGRPCTarget, cfg.ClimateAPIKey, cfg.GRPCTimeout)
	if err != nil {
		log.Fatal().Err(err).Str("event", "climate_client_failed").Msg("Could not connect to climate service")
	}
	defer climateClient.Close()
	microClient, err := grpcclient.NewMicroClient(cfg.MicroGRPCTarget, cfg.MicroAPIKey, cfg.GRPCTimeout)
	if err != nil {
		log.Fatal().Err(err).Str("event", "micro_client_failed").Msg("Could not connect to micro service")
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
		wsHandler,
		grpcProxyH,
		aforoH,
		recaudoH,
		healthH,
	)

	// â”€â”€ Iniciar servidor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Info().Str("event", "server_starting").Str("address", addr).Str("environment", cfg.Env).Msg("HTTP server starting")

	// Iniciar listener secundario en :8080 si no es el puerto principal
	if cfg.Port != "8080" {
		go func() {
			fmt.Printf("📡  Listener dual activo en http://localhost:8080\n")
			_ = r.Run(":8080")
		}()
	}

	if err := r.Run(addr); err != nil {
		log.Fatal().Err(err).Str("event", "server_failed").Msg("HTTP server stopped unexpectedly")
	}
}
