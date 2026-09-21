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
	busID           string
	routeDef        *RouteDefinition
	index           int // índice del waypoint actual
	segmentElapsed  float64
	passengers      int // pasajeros actuales
	hub             *ws.Hub
	tickDur         time.Duration
	speedMultiplier float64
	rng             *rand.Rand
	publish         func(ws.BusLocationData)
}

const defaultTickDuration = 2 * time.Second

// NewBusSimulator crea un simulador para un bus individual.
// startIndex permite escalonar los buses en distintas posiciones iniciales
// de la ruta para que no salgan todos del mismo punto.
func NewBusSimulator(busID string, route *RouteDefinition, startIndex int, hub *ws.Hub, tickDur time.Duration) *BusSimulator {
	src := rand.NewSource(time.Now().UnixNano() + int64(len(busID)))
	rng := rand.New(src)

	// Pasajeros iniciales aleatorios entre 8 y 28.
	initialPassengers := 8 + rng.Intn(20)
	if tickDur <= 0 {
		tickDur = defaultTickDuration
	}

	return &BusSimulator{
		busID:           busID,
		routeDef:        route,
		index:           startIndex % len(route.Waypoints),
		passengers:      initialPassengers,
		hub:             hub,
		tickDur:         tickDur,
		speedMultiplier: 1,
		rng:             rng,
		publish:         hub.PublishInternal,
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

// tick publica la posición interpolada y avanza el bus según el tiempo del tick.
func (s *BusSimulator) tick() {
	wps := s.routeDef.Waypoints
	n := len(wps)

	curr := wps[s.index]
	next := wps[(s.index+1)%n]
	segmentDuration := s.segmentDurationSeconds(s.index)
	progress := s.segmentElapsed / segmentDuration
	latitude := curr.Lat + (next.Lat-curr.Lat)*progress
	longitude := curr.Lng + (next.Lng-curr.Lng)*progress

	// Calcular heading real entre waypoints
	heading := calcHeading(curr.Lat, curr.Lng, next.Lat, next.Lng)

	// La velocidad se deriva del tramo, como en route_stops.distance_meters /
	// base_travel_time_seconds del esquema de nodos.
	speed := haversineMeters(curr.Lat, curr.Lng, next.Lat, next.Lng) / segmentDuration * 3.6

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
		Latitude:          latitude,
		Longitude:         longitude,
		Heading:           heading,
		Speed:             math.Round(speed*10) / 10,
		CurrentPassengers: s.passengers,
		Capacity:          s.routeDef.Capacity,
	}

	s.publish(data)

	// Avanzar por el tramo; un tick largo puede atravesar más de un nodo.
	s.segmentElapsed += s.tickDur.Seconds() * s.speedMultiplier
	for s.segmentElapsed >= segmentDuration {
		s.segmentElapsed -= segmentDuration
		s.index = (s.index + 1) % n
		segmentDuration = s.segmentDurationSeconds(s.index)
	}
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

func (s *BusSimulator) segmentDurationSeconds(index int) float64 {
	if len(s.routeDef.Segments) == len(s.routeDef.Waypoints) {
		if duration := s.routeDef.Segments[index].TravelSeconds; duration > 0 {
			return float64(duration)
		}
	}

	if len(s.routeDef.SegmentTravelSeconds) == len(s.routeDef.Waypoints) {
		if duration := s.routeDef.SegmentTravelSeconds[index]; duration > 0 {
			return float64(duration)
		}
	}

	if len(s.routeDef.Segments) > 0 {
		return s.graphProfileDuration(index)
	}

	// Fallback coherente con una velocidad urbana media de 30 km/h.
	start := s.routeDef.Waypoints[index]
	end := s.routeDef.Waypoints[(index+1)%len(s.routeDef.Waypoints)]
	distance := haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
	return math.Max(1, distance/30_000*3600)
}

func (s *BusSimulator) graphProfileDuration(index int) float64 {
	totalGraphSeconds := 0
	for _, segment := range s.routeDef.Segments {
		totalGraphSeconds += segment.TravelSeconds
	}
	if totalGraphSeconds <= 0 {
		return s.distanceProfileDuration(index)
	}

	totalDistance := 0.0
	for waypointIndex := range s.routeDef.Waypoints {
		start := s.routeDef.Waypoints[waypointIndex]
		end := s.routeDef.Waypoints[(waypointIndex+1)%len(s.routeDef.Waypoints)]
		totalDistance += haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
	}
	if totalDistance <= 0 {
		return 1
	}

	start := s.routeDef.Waypoints[index]
	end := s.routeDef.Waypoints[(index+1)%len(s.routeDef.Waypoints)]
	segmentDistance := haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
	return math.Max(1, float64(totalGraphSeconds)*segmentDistance/totalDistance)
}

func (s *BusSimulator) distanceProfileDuration(index int) float64 {
	start := s.routeDef.Waypoints[index]
	end := s.routeDef.Waypoints[(index+1)%len(s.routeDef.Waypoints)]
	distance := haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
	return math.Max(1, distance/30_000*3600)
}

func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusMeters = 6_371_000.0
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earthRadiusMeters * math.Asin(math.Sqrt(a))
}
