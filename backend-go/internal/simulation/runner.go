package simulation

import (
	"context"
	"fmt"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
	"github.com/rs/zerolog/log"
)

// RunnerConfig configura el comportamiento del runner de simulación.
type RunnerConfig struct {
	// TickDuration es el intervalo entre actualizaciones de posición por bus.
	// Un valor menor produce movimiento más fluido pero mayor carga de CPU/red.
	// Recomendado: 2s para desarrollo, 5s para staging.
	TickDuration time.Duration
	// SpeedMultiplier acelera o ralentiza el reloj del recorrido sin cambiar
	// los tiempos base del grafo. Es útil para visualizar la simulación local.
	SpeedMultiplier float64
}

// Runner orquesta todos los buses simulados de todas las rutas.
// Cada bus corre en su propia goroutine con un ticker independiente.
type Runner struct {
	hub           *ws.Hub
	config        RunnerConfig
	passengerFlow *service.PassengerFlowService
}

// NewRunner crea un Runner configurado listo para iniciar la simulación.
func NewRunner(hub *ws.Hub, config RunnerConfig) *Runner {
	if config.TickDuration <= 0 {
		config.TickDuration = defaultTickDuration
	}
	if config.SpeedMultiplier <= 0 {
		config.SpeedMultiplier = 1
	}

	return &Runner{
		hub:           hub,
		config:        config,
		passengerFlow: service.NewPassengerFlowService(),
	}
}

// Start lanza las goroutines de simulación para todos los buses de todas las rutas.
// Bloquea hasta que ctx sea cancelado.
//
// Los buses se escalonan en la ruta para que no salgan todos del mismo punto.
// Los IDs tienen el formato "sim-{routeID}-{n}" para distinguirlos de buses reales.
func (r *Runner) Start(ctx context.Context) {
	totalBuses := 0
	for _, route := range Routes {
		route := route // captura de variable para closure
		n := len(route.Waypoints)

		for i := 0; i < route.BusCount; i++ {
			busID := fmt.Sprintf("sim-%s-%d", route.ID, i+1)

			// Escalonar posición inicial: los buses se distribuyen
			// equitativamente a lo largo de los waypoints de la ruta.
			startIndex := (i * n) / route.BusCount

			sim := NewBusSimulator(busID, &route, startIndex, r.hub, r.config.TickDuration)
			sim.passengerFlow = r.passengerFlow
			sim.speedMultiplier = r.config.SpeedMultiplier

			// Añadir pequeño delay entre buses de la misma ruta para evitar
			// que todos hagan su primer tick exactamente al mismo tiempo.
			delay := time.Duration(i*200) * time.Millisecond

			go func() {
				timer := time.NewTimer(delay)
				defer timer.Stop()
				select {
				case <-ctx.Done():
					return
				case <-timer.C:
				}

				log.Debug().Str("event", "simulation_bus_started").
					Str("bus_id", busID).Str("route", route.Name).
					Int("waypoint", startIndex+1).Int("waypoints", n).
					Msg("Simulation bus started")
				sim.Run(ctx)
			}()

			totalBuses++
		}
	}

	log.Info().Str("event", "simulation_ready").Int("buses", totalBuses).
		Int("routes", len(Routes)).Msg("Simulation buses active")
	<-ctx.Done()
	log.Info().Str("event", "simulation_stopped").Msg("Simulation stopped")
}
