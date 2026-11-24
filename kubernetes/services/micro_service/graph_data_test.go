package main

import (
	"os"
	"regexp"
	"sort"
	"strconv"
	"testing"
)

// Estas pruebas revisan los datos oficiales de micros-db con las reglas de
// MODELO_GRAFO.md, sin necesitar una base de datos.

const (
	seedFilePath = "../micro_db/micros-db-init-scripts.yaml"

	minServiceLatitude  = -38.80
	maxServiceLatitude  = -38.66
	minServiceLongitude = -72.79
	maxServiceLongitude = -72.47

	minRideSpeedKmh       = 8.0
	maxRideSpeedKmh       = 25.0
	minWalkSpeedMps       = 0.8
	maxWalkSpeedMps       = 1.5
	maxStreetFactor       = 1.40
	distanceToleranceM    = 5.0
	metersPerSecondToKmh  = 3.6
	expectedRideEdges     = 13
	expectedWalkEdges     = 42
	expectedNetworkStops  = 7
	expectedReachableTrip = 42
)

var (
	seedStopPattern = regexp.MustCompile(`\('(PAR-[A-Z0-9-]+)', '(?:[^']|'')+', ST_SetSRID\(ST_MakePoint\((-?[\d.]+), (-?[\d.]+)\)`)
	seedRidePattern = regexp.MustCompile(`\('((L\w+)-(?:IDA|VTA))', '(PAR-[A-Z0-9-]+)', '(PAR-[A-Z0-9-]+)', (\d+), (\d+), (\d+)\)`)
	seedWalkPattern = regexp.MustCompile(`\('(PAR-[A-Z0-9-]+)', '(PAR-[A-Z0-9-]+)', (\d+), (\d+)\)`)
)

// knownSlowWalks son valores atípicos documentados en MODELO_GRAFO.md. Quedan
// aquí hasta que el equipo los confirme, para que un valor nuevo sí falle.
var knownSlowWalks = map[string]bool{
	"PAR-CJP-02|PAR-DPORT-01": true,
	"PAR-DPORT-01|PAR-CJP-02": true,
}

type seedRide struct {
	TripID, RouteID, FromStopID, ToStopID string
	Sequence, TimeSeconds, DistanceMeters int
}

type seedWalk struct {
	FromStopID, ToStopID        string
	TimeSeconds, DistanceMeters int
}

type seedNetwork struct {
	Stops map[string]Stop
	Rides []seedRide
	Walks []seedWalk
}

func parseNumber(t *testing.T, text string) int {
	t.Helper()
	number, err := strconv.Atoi(text)
	if err != nil {
		t.Fatalf("número inválido %q: %v", text, err)
	}
	return number
}

func parseCoordinate(t *testing.T, text string) float64 {
	t.Helper()
	coordinate, err := strconv.ParseFloat(text, 64)
	if err != nil {
		t.Fatalf("coordenada inválida %q: %v", text, err)
	}
	return coordinate
}

func loadSeedNetwork(t *testing.T) seedNetwork {
	t.Helper()
	seedContent, err := os.ReadFile(seedFilePath)
	if err != nil {
		t.Fatalf("no se pudo leer %s: %v", seedFilePath, err)
	}
	seedText := string(seedContent)

	network := seedNetwork{Stops: make(map[string]Stop)}
	for _, match := range seedStopPattern.FindAllStringSubmatch(seedText, -1) {
		network.Stops[match[1]] = Stop{ID: match[1], Longitude: parseCoordinate(t, match[2]), Latitude: parseCoordinate(t, match[3])}
	}
	for _, match := range seedRidePattern.FindAllStringSubmatch(seedText, -1) {
		network.Rides = append(network.Rides, seedRide{
			TripID: match[1], RouteID: match[2], FromStopID: match[3], ToStopID: match[4],
			Sequence: parseNumber(t, match[5]), TimeSeconds: parseNumber(t, match[6]), DistanceMeters: parseNumber(t, match[7]),
		})
	}
	for _, match := range seedWalkPattern.FindAllStringSubmatch(seedText, -1) {
		network.Walks = append(network.Walks, seedWalk{
			FromStopID: match[1], ToStopID: match[2], TimeSeconds: parseNumber(t, match[3]), DistanceMeters: parseNumber(t, match[4]),
		})
	}
	if len(network.Rides) != expectedRideEdges || len(network.Walks) != expectedWalkEdges {
		t.Fatalf("se leyeron %d aristas en micro y %d a pie; revisa el formato del seed", len(network.Rides), len(network.Walks))
	}
	return network
}

func (network seedNetwork) buildGraph() *TransitGraph {
	graph := NewTransitGraph()
	graph.Stops = network.Stops
	for _, ride := range network.Rides {
		graph.Edges[ride.FromStopID] = append(graph.Edges[ride.FromStopID], Edge{
			ToStopID: ride.ToStopID, RouteID: ride.RouteID, TripID: ride.TripID, BaseTimeSec: ride.TimeSeconds, DistanceM: ride.DistanceMeters,
		})
	}
	for _, walk := range network.Walks {
		graph.Edges[walk.FromStopID] = append(graph.Edges[walk.FromStopID], Edge{
			ToStopID: walk.ToStopID, RouteID: walkRouteID, BaseTimeSec: walk.TimeSeconds, DistanceM: walk.DistanceMeters,
		})
	}
	return graph
}

func (network seedNetwork) straightMeters(t *testing.T, fromStopID, toStopID string) float64 {
	t.Helper()
	fromStop, fromExists := network.Stops[fromStopID]
	toStop, toExists := network.Stops[toStopID]
	if !fromExists || !toExists {
		t.Fatalf("la arista %s -> %s usa un paradero inexistente", fromStopID, toStopID)
	}
	return haversineMeters(fromStop.Latitude, fromStop.Longitude, toStop.Latitude, toStop.Longitude)
}

func checkStreetFactor(t *testing.T, network seedNetwork, fromStopID, toStopID string, distanceMeters int) {
	t.Helper()
	straightMeters := network.straightMeters(t, fromStopID, toStopID)
	if float64(distanceMeters) < straightMeters-distanceToleranceM {
		t.Errorf("%s -> %s mide %d m, menos que la línea recta (%.0f m)", fromStopID, toStopID, distanceMeters, straightMeters)
	}
	if float64(distanceMeters)/straightMeters > maxStreetFactor {
		t.Errorf("%s -> %s supera el factor de calle máximo", fromStopID, toStopID)
	}
}

func TestSeedStopsAreInsideServiceArea(t *testing.T) {
	for stopID, stop := range loadSeedNetwork(t).Stops {
		if stop.Latitude < minServiceLatitude || stop.Latitude > maxServiceLatitude ||
			stop.Longitude < minServiceLongitude || stop.Longitude > maxServiceLongitude {
			t.Errorf("%s está fuera del área de servicio: %.6f, %.6f", stopID, stop.Latitude, stop.Longitude)
		}
	}
}

func TestSeedTripsAreContinuous(t *testing.T) {
	ridesByTrip := make(map[string][]seedRide)
	for _, ride := range loadSeedNetwork(t).Rides {
		ridesByTrip[ride.TripID] = append(ridesByTrip[ride.TripID], ride)
	}
	for tripID, rides := range ridesByTrip {
		sort.Slice(rides, func(firstIndex, secondIndex int) bool {
			return rides[firstIndex].Sequence < rides[secondIndex].Sequence
		})
		for rideIndex, ride := range rides {
			if ride.Sequence != rideIndex+1 {
				t.Errorf("%s tiene stop_sequence %d en la posición %d", tripID, ride.Sequence, rideIndex+1)
			}
			if rideIndex > 0 && rides[rideIndex-1].ToStopID != ride.FromStopID {
				t.Errorf("%s se corta entre %s y %s", tripID, rides[rideIndex-1].ToStopID, ride.FromStopID)
			}
		}
	}
}

func TestSeedRidesHaveValidTimesAndDistances(t *testing.T) {
	network := loadSeedNetwork(t)
	for _, ride := range network.Rides {
		if ride.TimeSeconds <= 0 || ride.DistanceMeters <= 0 {
			t.Fatalf("%s %s -> %s debe tener tiempo y distancia positivos", ride.TripID, ride.FromStopID, ride.ToStopID)
		}
		speedKmh := float64(ride.DistanceMeters) / float64(ride.TimeSeconds) * metersPerSecondToKmh
		if speedKmh < minRideSpeedKmh || speedKmh > maxRideSpeedKmh {
			t.Errorf("%s %s -> %s tiene %.1f km/h", ride.TripID, ride.FromStopID, ride.ToStopID, speedKmh)
		}
		checkStreetFactor(t, network, ride.FromStopID, ride.ToStopID, ride.DistanceMeters)
	}
}

func TestSeedWalksAreSymmetricAndValid(t *testing.T) {
	network := loadSeedNetwork(t)
	walksByPair := make(map[string]seedWalk)
	for _, walk := range network.Walks {
		walksByPair[walk.FromStopID+"|"+walk.ToStopID] = walk
	}
	for pairKey, walk := range walksByPair {
		returnWalk, exists := walksByPair[walk.ToStopID+"|"+walk.FromStopID]
		if !exists || returnWalk.TimeSeconds != walk.TimeSeconds || returnWalk.DistanceMeters != walk.DistanceMeters {
			t.Errorf("%s no tiene un regreso con los mismos valores", pairKey)
		}
		speedMps := float64(walk.DistanceMeters) / float64(walk.TimeSeconds)
		if !knownSlowWalks[pairKey] && (speedMps < minWalkSpeedMps || speedMps > maxWalkSpeedMps) {
			t.Errorf("%s tiene %.2f m/s", pairKey, speedMps)
		}
		checkStreetFactor(t, network, walk.FromStopID, walk.ToStopID, walk.DistanceMeters)
	}
}

func TestSeedNetworkIsStronglyConnectedByBus(t *testing.T) {
	network := loadSeedNetwork(t)
	nextStops := make(map[string][]string)
	networkStops := make(map[string]bool)
	for _, ride := range network.Rides {
		nextStops[ride.FromStopID] = append(nextStops[ride.FromStopID], ride.ToStopID)
		networkStops[ride.FromStopID], networkStops[ride.ToStopID] = true, true
	}
	if len(networkStops) != expectedNetworkStops {
		t.Fatalf("la red tiene %d paraderos", len(networkStops))
	}
	for originStopID := range networkStops {
		reachedStops := map[string]bool{originStopID: true}
		pendingStops := []string{originStopID}
		for len(pendingStops) > 0 {
			currentStopID := pendingStops[len(pendingStops)-1]
			pendingStops = pendingStops[:len(pendingStops)-1]
			for _, nextStopID := range nextStops[currentStopID] {
				if !reachedStops[nextStopID] {
					reachedStops[nextStopID] = true
					pendingStops = append(pendingStops, nextStopID)
				}
			}
		}
		if len(reachedStops) != len(networkStops) {
			t.Errorf("desde %s solo se llega a %d paraderos", originStopID, len(reachedStops))
		}
	}
}

func TestPlannerReachesEveryNetworkTrip(t *testing.T) {
	network := loadSeedNetwork(t)
	graph := network.buildGraph()
	// Solo los paraderos con aristas forman la red; el catálogo no participa.
	networkStops := make(map[string]bool)
	for _, ride := range network.Rides {
		networkStops[ride.FromStopID], networkStops[ride.ToStopID] = true, true
	}
	foundTrips := 0
	for originStopID := range networkStops {
		for destinationStopID := range networkStops {
			if originStopID == destinationStopID {
				continue
			}
			if _, found := fastestPath(graph, originStopID, destinationStopID); !found {
				t.Errorf("sin ruta de %s a %s", originStopID, destinationStopID)
				continue
			}
			foundTrips++
		}
	}
	if foundTrips != expectedReachableTrip {
		t.Errorf("se encontraron %d viajes", foundTrips)
	}
}

// El cálculo a mano de este viaje está en MODELO_GRAFO.md.
func TestPlannerMatchesHandCalculatedTrip(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	path, found := fastestPath(graph, "PAR-CSF-01", "PAR-MRODRI-01")
	if !found || len(path) != 2 {
		t.Fatalf("se esperaban 2 tramos y se obtuvieron %d", len(path))
	}
	totalSeconds, totalMeters := 0, 0
	for _, step := range path {
		totalSeconds += step.Edge.BaseTimeSec
		totalMeters += step.Edge.DistanceM
	}
	if totalSeconds != 420 || totalMeters != 1380 {
		t.Errorf("se esperaban 420 s y 1380 m, y se obtuvieron %d s y %d m", totalSeconds, totalMeters)
	}
	if path[0].Edge.ToStopID != "PAR-DPORT-01" || path[0].Edge.RouteID == walkRouteID {
		t.Errorf("el primer tramo debe ser en micro hasta PAR-DPORT-01: %+v", path[0])
	}
	if path[1].Edge.RouteID != walkRouteID {
		t.Errorf("el segundo tramo debe ser a pie: %+v", path[1])
	}
}
