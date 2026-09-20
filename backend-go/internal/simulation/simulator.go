package simulation

import (
	"context"
	"math"
	"math/rand"
	"time"

	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

// BusSimulator mueve un bus virtual a lo largo de los waypoints de su ruta
// en ciclo infinito, publicando actualizaciones al Hub WebSocket.
type BusSimulator struct {
	busID      string
	routeDef   *RouteDefinition
	index      int // índice del waypoint actual
	passengers int // pasajeros actuales
	hub        *ws.Hub
	tickDur    time.Duration
	rng        *rand.Rand
}

// NewBusSimulator crea un simulador para un bus individual.
// startIndex permite escalonar los buses en distintas posiciones iniciales
// de la ruta para que no salgan todos del mismo punto.
func NewBusSimulator(busID string, route *RouteDefinition, startIndex int, hub *ws.Hub, tickDur time.Duration) *BusSimulator {
	src := rand.NewSource(time.Now().UnixNano() + int64(len(busID)))
	rng := rand.New(src)

	// Pasajeros iniciales aleatorios entre 8 y 28
	initialPassengers := 8 + rng.Intn(20)

	return &BusSimulator{
		busID:      busID,
		routeDef:   route,
		index:      startIndex % len(route.Waypoints),
		passengers: initialPassengers,
		hub:        hub,
		tickDur:    tickDur,
		rng:        rng,
	}
}

// Run ejecuta el loop de simulación. Debe llamarse como goroutine.
// Se detiene cuando ctx es cancelado.
func (s *BusSimulator) Run(ctx context.Context) {
	ticker := time.NewTicker(s.tickDur)
	defer ticker.Stop()

	// Emitir posición inicial de inmediato (sin esperar el primer tick)
	s.tick()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick()
		}
	}
}

// tick avanza el bus al siguiente waypoint y publica su nueva posición.
func (s *BusSimulator) tick() {
	wps := s.routeDef.Waypoints
	n := len(wps)

	curr := wps[s.index]
	next := wps[(s.index+1)%n]

	// Calcular heading real entre waypoints
	heading := calcHeading(curr.Lat, curr.Lng, next.Lat, next.Lng)

	// Velocidad: 20–45 km/h con variación aleatoria por tramo
	speed := 20.0 + s.rng.Float64()*25.0

	// Fluctuación de pasajeros: ±3 por tick, respetando límites
	delta := s.rng.Intn(7) - 3 // -3 a +3
	s.passengers = clampInt(s.passengers+delta, 0, s.routeDef.Capacity)

	// Aplicar efecto de hora punta (aumenta carga en horas pico)
	hour := time.Now().Hour()
	if isPeakHour(hour) && s.passengers < int(float64(s.routeDef.Capacity)*0.7) {
		s.passengers = clampInt(s.passengers+s.rng.Intn(3), 0, s.routeDef.Capacity)
	}

	data := ws.BusLocationData{
		BusID:             s.busID,
		RouteID:           s.routeDef.ID,
		Latitude:          curr.Lat,
		Longitude:         curr.Lng,
		Heading:           heading,
		Speed:             math.Round(speed*10) / 10,
		CurrentPassengers: s.passengers,
		Capacity:          s.routeDef.Capacity,
	}

	s.hub.PublishInternal(data)

	// Avanzar al siguiente waypoint (circular)
	s.index = (s.index + 1) % n
}

// ── Funciones auxiliares ──────────────────────────────────────────────────────

// calcHeading calcula el heading (ángulo 0–360°) entre dos puntos GPS.
// 0 = Norte, 90 = Este, 180 = Sur, 270 = Oeste.
func calcHeading(lat1, lng1, lat2, lng2 float64) float64 {
	lat1R := lat1 * math.Pi / 180
	lat2R := lat2 * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180

	x := math.Sin(dLng) * math.Cos(lat2R)
	y := math.Cos(lat1R)*math.Sin(lat2R) - math.Sin(lat1R)*math.Cos(lat2R)*math.Cos(dLng)

	heading := math.Atan2(x, y) * 180 / math.Pi
	// Normalizar a [0, 360)
	return math.Mod(heading+360, 360)
}

// isPeakHour retorna true si la hora está en una franja punta.
func isPeakHour(hour int) bool {
	return (hour >= 7 && hour < 9) || (hour >= 12 && hour < 14) || (hour >= 17 && hour < 19)
}

// clampInt acota v en el rango [min, max].
func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
