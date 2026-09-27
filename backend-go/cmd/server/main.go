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

	// ── Configuración ─────────────────────────────────────────
	cfg := config.Load()

	// ── Contexto global (para shutdown ordenado) ──────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Base de datos (opcional en modo simulación) ───────────
	// Cuando SIMULATION_ENABLED=true y la BD no está disponible,
	// el servidor arranca en modo degradado: solo WebSocket + simulación.
	// Los endpoints REST que requieren BD devolverán 503.
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

	// ── Datos de prueba (solo si hay BD y no es producción) ────
	if dbAvailable && cfg.Env != "production" {
		if err := seed.Run(ctx, pool); err != nil {
			log.Warn().Err(err).Str("event", "seed_failed").Msg("Could not create seed data")
		}
	}

	// ── Token blacklist (logout seguro) ───────────────────────
	blacklist := token.NewBlacklist()

	// ── Repositorios y Handlers (requieren BD) ────────────────
	var (
		authH      *handler.AuthHandler
		userH      *handler.UserHandler
		busH       *handler.BusHandler
		routeH     *handler.RouteHandler
		stopH      *handler.StopHandler
		complaintH *handler.ComplaintHandler
	)

	if dbAvailable {
		userRepo := repository.NewUserRepository(pool)
		busRepo := repository.NewBusRepository(pool)
		routeRepo := repository.NewRouteRepository(pool)
		stopRepo := repository.NewStopRepository(pool)
		complaintRepo := repository.NewComplaintRepository(pool)

		authH = handler.NewAuthHandler(userRepo, cfg.JWTSecret, blacklist)
		userH = handler.NewUserHandler(userRepo)
		busH = handler.NewBusHandler(busRepo)
		routeH = handler.NewRouteHandler(routeRepo, busRepo)
		stopH = handler.NewStopHandler(stopRepo)
		complaintH = handler.NewComplaintHandler(complaintRepo)
	}

	// ── Servicio de ocupación (no requiere BD) ─────────────────
	occupancySvc := service.NewOccupancyService()

	// ── Conectar predictor ML si está configurado ──────────────
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

	// ── WebSocket Hub (Pub/Sub — no requiere BD) ──────────────
	hub := ws.NewHub(occupancySvc)
	go hub.Run()

	wsHandler := ws.NewWSHandler(hub, cfg.JWTSecret, []string{cfg.CORSOrigin})
	log.Info().Str("event", "websocket_ready").Str("path", "/ws").Msg("WebSocket Pub/Sub active")

	// ── Simulación GPS (buses virtuales rutas 7A, 7B, 1C) ─────
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

	// ── Router ────────────────────────────────────────────────
	r := router.Setup(cfg.CORSOrigin, cfg.JWTSecret, pool, blacklist,
		authH, userH, busH, routeH, stopH, complaintH, occupancyH, wsHandler)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Info().Str("event", "server_starting").Str("address", addr).Str("environment", cfg.Env).Msg("HTTP server starting")

	if err := r.Run(addr); err != nil {
		log.Fatal().Err(err).Str("event", "server_failed").Msg("HTTP server stopped unexpectedly")
	}
}
