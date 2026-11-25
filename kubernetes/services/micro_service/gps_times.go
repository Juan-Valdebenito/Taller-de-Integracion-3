package main

// Tiempos observados con el GPS de las micros: cuánto tardan en cada tramo y cada
// cuánto pasa una línea. El tiempo oficial sigue siendo la base: las observaciones
// lo corrigen de a poco, y sin ellas no cambia nada.

import (
	"math"
	"sync"
	"time"
)

const (
	// stopRadiusMeters es a qué distancia de un paradero se considera que la micro
	// pasa por él.
	stopRadiusMeters = 80.0
	// maxGPSGap es cuánto puede faltar la señal. Con un corte mayor no se sabe qué
	// hizo la micro, y se empieza de nuevo.
	maxGPSGap = 5 * time.Minute
	// observationMaxAge es cuánto vale una observación: refleja el tráfico actual.
	observationMaxAge = time.Hour
	// maxObservations limita la memoria por tramo y por línea.
	maxObservations = 20
	// officialTimeWeight es cuántas observaciones equivale el tiempo oficial. Con 2,
	// una sola micro atrasada lo corrige en un tercio.
	officialTimeWeight = 2.0
	// Un tramo mucho más rápido o más lento que lo oficial es un error de GPS o una
	// micro detenida, no tráfico.
	minObservedFactor = 0.4
	maxObservedFactor = 3.0
	// Intervalos entre micros que se aceptan.
	minObservedHeadway = time.Minute
	maxObservedHeadway = time.Hour
)

// GPSPosition es una posición informada por una micro.
type GPSPosition struct {
	BusID, RouteID      string
	Latitude, Longitude float64
	Time                time.Time
}

// segmentKey es un tramo de una línea entre dos paraderos seguidos.
type segmentKey struct{ RouteID, FromStopID, ToStopID string }

type observation struct {
	seconds float64
	at      time.Time
}

// busProgress es dónde va una micro en su recorrido.
type busProgress struct {
	routeID    string
	lastStopID string
	arrivedAt  time.Time
	lastSeenAt time.Time
	// isConfirmed indica que ya pasó por dos paraderos seguidos de su línea. Antes,
	// podría ir por la calzada contraria, junto a un paradero que no es el suyo.
	isConfirmed bool
}

// GPSTimes convierte posiciones en tiempos observados. Es seguro usarlo desde
// varias goroutines.
type GPSTimes struct {
	mutex        sync.Mutex
	buses        map[string]busProgress
	segments     map[segmentKey][]observation
	headways     map[string][]observation
	lastArrivals map[segmentKey]time.Time
}

func NewGPSTimes() *GPSTimes {
	return &GPSTimes{
		buses:        make(map[string]busProgress),
		segments:     make(map[segmentKey][]observation),
		headways:     make(map[string][]observation),
		lastArrivals: make(map[segmentKey]time.Time),
	}
}

// Record registra una posición. Devuelve false si se ignoró: datos inválidos, una
// línea que no está en el grafo o una lectura más antigua que la anterior.
func (times *GPSTimes) Record(graph *TransitGraph, position GPSPosition) bool {
	if position.BusID == "" || position.Time.IsZero() || !isValidLocation(position.Latitude, position.Longitude) {
		return false
	}
	stopIDs := lineStopIDs(graph, position.RouteID)
	if len(stopIDs) == 0 {
		return false
	}
	times.mutex.Lock()
	defer times.mutex.Unlock()
	progress, known := times.buses[position.BusID]
	if known && !position.Time.After(progress.lastSeenAt) {
		return false
	}
	if !known || progress.routeID != position.RouteID || position.Time.Sub(progress.lastSeenAt) > maxGPSGap {
		progress = busProgress{routeID: position.RouteID}
	}
	progress.lastSeenAt = position.Time
	if stopID := nearestLineStop(graph, stopIDs, position, progress.lastStopID); stopID != "" {
		times.arrive(graph, &progress, stopID, position.Time)
	}
	times.buses[position.BusID] = progress
	times.forgetOldBuses(position.Time)
	return true
}

// arrive registra que una micro llegó a un paradero.
func (times *GPSTimes) arrive(graph *TransitGraph, progress *busProgress, stopID string, arrivedAt time.Time) {
	if progress.lastStopID == "" {
		progress.lastStopID, progress.arrivedAt = stopID, arrivedAt
		return
	}
	if stopID == progress.lastStopID {
		return
	}
	segment, isNext := lineSegment(graph, progress.routeID, progress.lastStopID, stopID)
	if !isNext {
		// Pasa junto a un paradero que no es el siguiente. Si todavía no está
		// confirmada, su punto de partida pudo ser falso.
		if !progress.isConfirmed {
			progress.lastStopID, progress.arrivedAt = stopID, arrivedAt
		}
		return
	}
	key := segmentKey{progress.routeID, progress.lastStopID, stopID}
	if elapsed := arrivedAt.Sub(progress.arrivedAt).Seconds(); progress.isConfirmed && isPlausibleSegment(elapsed, segment.BaseTimeSec) {
		times.segments[key] = addObservation(times.segments[key], elapsed, arrivedAt)
	}
	// El intervalo se mide por tramo y no solo por paradero, para no mezclar los dos
	// sentidos de una línea.
	if previousArrival, seen := times.lastArrivals[key]; seen {
		if headway := arrivedAt.Sub(previousArrival); headway >= minObservedHeadway && headway <= maxObservedHeadway {
			times.headways[progress.routeID] = addObservation(times.headways[progress.routeID], headway.Seconds(), arrivedAt)
		}
	}
	times.lastArrivals[key] = arrivedAt
	progress.lastStopID, progress.arrivedAt, progress.isConfirmed = stopID, arrivedAt, true
}

// forgetOldBuses olvida las micros sin señal, para que el registro no crezca.
func (times *GPSTimes) forgetOldBuses(now time.Time) {
	for busID, progress := range times.buses {
		if now.Sub(progress.lastSeenAt) > observationMaxAge {
			delete(times.buses, busID)
		}
	}
}

// ObservedTimes son los tiempos que el GPS corrige, en segundos.
type ObservedTimes struct {
	SegmentSeconds map[segmentKey]int
	HeadwaySeconds map[string]int
}

// Observed combina las observaciones recientes con los tiempos oficiales.
func (times *GPSTimes) Observed(graph *TransitGraph, now time.Time) ObservedTimes {
	observed := ObservedTimes{SegmentSeconds: make(map[segmentKey]int), HeadwaySeconds: make(map[string]int)}
	times.mutex.Lock()
	defer times.mutex.Unlock()
	for key, observations := range times.segments {
		segment, exists := lineSegment(graph, key.RouteID, key.FromStopID, key.ToStopID)
		if seconds, hasRecent := blendWithOfficial(observations, float64(segment.BaseTimeSec), now); exists && hasRecent {
			observed.SegmentSeconds[key] = seconds
		}
	}
	for routeID, observations := range times.headways {
		if seconds, hasRecent := blendWithOfficial(observations, float64(headwaySeconds(routeID)), now); hasRecent {
			observed.HeadwaySeconds[routeID] = seconds
		}
	}
	return observed
}

// blendWithOfficial promedia las observaciones recientes con el valor oficial.
func blendWithOfficial(observations []observation, officialSeconds float64, now time.Time) (int, bool) {
	totalSeconds, recentCount := 0.0, 0.0
	for _, item := range observations {
		if now.Sub(item.at) <= observationMaxAge {
			totalSeconds += item.seconds
			recentCount++
		}
	}
	if recentCount == 0 {
		return 0, false
	}
	return int(math.Round((officialSeconds*officialTimeWeight + totalSeconds) / (officialTimeWeight + recentCount))), true
}

func addObservation(observations []observation, seconds float64, at time.Time) []observation {
	observations = append(observations, observation{seconds: seconds, at: at})
	if len(observations) > maxObservations {
		observations = observations[len(observations)-maxObservations:]
	}
	return observations
}

func isPlausibleSegment(elapsedSeconds float64, officialSeconds int) bool {
	official := float64(officialSeconds)
	return elapsedSeconds >= official*minObservedFactor && elapsedSeconds <= official*maxObservedFactor
}

// lineSegment busca el tramo de una línea entre dos paraderos.
func lineSegment(graph *TransitGraph, routeID, fromStopID, toStopID string) (Edge, bool) {
	for _, edge := range graph.Edges[fromStopID] {
		if edge.RouteID == routeID && edge.ToStopID == toStopID {
			return edge, true
		}
	}
	return Edge{}, false
}

// lineStopIDs entrega los paraderos de una línea. Las caminatas no son una línea.
func lineStopIDs(graph *TransitGraph, routeID string) map[string]bool {
	stopIDs := make(map[string]bool)
	if routeID == "" || routeID == walkRouteID {
		return stopIDs
	}
	for fromStopID, edges := range graph.Edges {
		for _, edge := range edges {
			if edge.RouteID == routeID {
				stopIDs[fromStopID], stopIDs[edge.ToStopID] = true, true
			}
		}
	}
	return stopIDs
}

// nearestLineStop entrega el paradero de la línea junto a la micro, o "". Si hay dos
// cerca, prefiere el que no es el último: hacia allá avanza.
func nearestLineStop(graph *TransitGraph, stopIDs map[string]bool, position GPSPosition, lastStopID string) string {
	nearestStopID, nearestMeters := "", math.Inf(1)
	for stopID := range stopIDs {
		stop := graph.Stops[stopID]
		meters := haversineMeters(position.Latitude, position.Longitude, stop.Latitude, stop.Longitude)
		if meters > stopRadiusMeters {
			continue
		}
		if stopID == lastStopID {
			meters += stopRadiusMeters
		}
		if meters < nearestMeters || (meters == nearestMeters && stopID < nearestStopID) {
			nearestStopID, nearestMeters = stopID, meters
		}
	}
	return nearestStopID
}

// withObservedTimes entrega un grafo con los tiempos corregidos. El original no
// cambia. A* sigue siendo válido: calcula su velocidad máxima desde este grafo.
func withObservedTimes(graph *TransitGraph, observed ObservedTimes) *TransitGraph {
	if len(observed.SegmentSeconds) == 0 {
		return graph
	}
	corrected := &TransitGraph{Stops: graph.Stops, Edges: make(map[string][]Edge, len(graph.Edges))}
	for fromStopID, edges := range graph.Edges {
		correctedEdges := make([]Edge, len(edges))
		for edgeIndex, edge := range edges {
			if seconds, known := observed.SegmentSeconds[segmentKey{edge.RouteID, fromStopID, edge.ToStopID}]; known {
				edge.BaseTimeSec = seconds
			}
			correctedEdges[edgeIndex] = edge
		}
		corrected.Edges[fromStopID] = correctedEdges
	}
	return corrected
}
