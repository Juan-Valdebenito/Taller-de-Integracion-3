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
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/router"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/seed"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/simulation"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

func main() {
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
		fmt.Println("⚠️  Servidor en MODO SIMULACIÓN sin base de datos")
		fmt.Println("    Los endpoints REST no estarán disponibles.")
		if !cfg.SimulationEnabled {
			log.Fatal("❌ La BD no está disponible y SIMULATION_ENABLED=false. Abortando.")
		}
	}

	// ── Datos de prueba (solo si hay BD y no es producción) ────
	if dbAvailable && cfg.Env != "production" {
		if err := seed.Run(ctx, pool); err != nil {
			log.Printf("⚠️  No se pudieron crear los datos de prueba: %v\n", err)
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
		fmt.Println("🔮  Predictor heurístico activo (PREDICTION_TRANSPORT no configurado)")
	}

	occupancyH := handler.NewOccupancyHandler(occupancySvc)

	// ── WebSocket Hub (Pub/Sub — no requiere BD) ──────────────
	hub := ws.NewHub(occupancySvc)
	go hub.Run()

	wsHandler := ws.NewWSHandler(hub, cfg.JWTSecret, []string{cfg.CORSOrigin})
	fmt.Println("📡  WebSocket Pub/Sub activo en /ws")

	// ── Simulación GPS (buses virtuales rutas 7A, 7B, 1C) ─────
	if cfg.SimulationEnabled {
		simRunner := simulation.NewRunner(hub, simulation.RunnerConfig{
			TickDuration: time.Duration(cfg.SimulationTickMs) * time.Millisecond,
		})
		go simRunner.Start(ctx)
		fmt.Printf("🎮  Motor de simulación GPS activo — tick: %dms, rutas: 7A, 7B, 1C\n",
			cfg.SimulationTickMs)
	} else {
		fmt.Println("⏸️   Simulación GPS desactivada (SIMULATION_ENABLED=false)")
	}

	// ── Router ────────────────────────────────────────────────
	r := router.Setup(cfg.CORSOrigin, cfg.JWTSecret, pool, blacklist,
		authH, userH, busH, routeH, stopH, complaintH, occupancyH, wsHandler)

	// ── Iniciar servidor ──────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("\n🚌  Servidor Go corriendo en http://localhost%s\n", addr)
	fmt.Printf("🌍  Entorno: %s\n\n", cfg.Env)

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Error al iniciar servidor: %v", err)
	}
}
