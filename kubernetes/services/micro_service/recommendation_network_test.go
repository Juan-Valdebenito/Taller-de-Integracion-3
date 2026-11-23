package main

// Pruebas del planificador sobre toda la red oficial. Para cada par de paraderos
// se prueban tres combinaciones: coordenada a coordenada, paradero a coordenada y
// coordenada a paradero. Las coordenadas quedan unos 55 m al norte del paradero.

import (
	"reflect"
	"testing"
)

// nearStopOffsetDegrees son unos 55 m de latitud.
const nearStopOffsetDegrees = 0.0005

// recommendationCase es un origen y un destino, con los IDs que deben aparecer al
// inicio y al final de cada ruta.
type recommendationCase struct {
	name          string
	origin        RoutePoint
	destination   RoutePoint
	expectedStart string
	expectedEnd   string
}

func pointNearStop(graph *TransitGraph, stopID string) RoutePoint {
	stop := graph.Stops[stopID]
	return locationPoint(stop.Latitude+nearStopOffsetDegrees, stop.Longitude)
}

// officialNetworkCases arma las tres combinaciones para cada par de paraderos.
func officialNetworkCases(graph *TransitGraph) []recommendationCase {
	cases := make([]recommendationCase, 0)
	for _, stopPair := range allStopPairs(graph) {
		originStopID, destinationStopID := stopPair[0], stopPair[1]
		nearOrigin, nearDestination := pointNearStop(graph, originStopID), pointNearStop(graph, destinationStopID)
		cases = append(cases,
			recommendationCase{"location to location " + originStopID + " -> " + destinationStopID,
				nearOrigin, nearDestination, userLocationID, destinationLocationID},
			recommendationCase{"stop to location " + originStopID + " -> " + destinationStopID,
				stopPoint(originStopID), nearDestination, originStopID, destinationLocationID},
			recommendationCase{"location to stop " + originStopID + " -> " + destinationStopID,
				nearOrigin, stopPoint(destinationStopID), userLocationID, destinationStopID},
		)
	}
	return cases
}

// assertValidRecommendations revisa las reglas que toda respuesta debe cumplir.
func assertValidRecommendations(t *testing.T, testCase recommendationCase, routes [][]pathStep, limit, maxWalkMeters int, weights CostWeights) {
	t.Helper()
	if len(routes) == 0 || len(routes) > limit {
		t.Fatalf("%s: got %d routes, want between 1 and %d", testCase.name, len(routes), limit)
	}
	knownRoutes := make(map[string]bool)
	for _, route := range routes {
		if route[0].From != testCase.expectedStart || route[len(route)-1].Edge.ToStopID != testCase.expectedEnd {
			t.Fatalf("%s: route goes from %s to %s", testCase.name, route[0].From, route[len(route)-1].Edge.ToStopID)
		}
		assertConnectedRoute(t, route)
		for _, step := range route {
			if step.Edge.RouteID == walkRouteID && step.Edge.DistanceM > maxWalkMeters {
				t.Fatalf("%s: walk of %d m exceeds %d m", testCase.name, step.Edge.DistanceM, maxWalkMeters)
			}
		}
		if knownRoutes[pathKey(route)] {
			t.Fatalf("%s: route repeated: %s", testCase.name, pathKey(route))
		}
		knownRoutes[pathKey(route)] = true
	}
	assertSortedByCost(t, routes, weights)
}

func TestRecommendRoutesAreValidOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, testCase := range officialNetworkCases(graph) {
		routes, err := recommendRoutes(graph, testCase.origin, testCase.destination, 3, weights, maxWalkDistanceMeters)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", testCase.name, err)
		}
		assertValidRecommendations(t, testCase, routes, 3, maxWalkDistanceMeters, weights)
	}
}

// Con una coordenada, la caminata inicial o final no debe exceder el máximo
// aunque sea más corto que el de la red.
func TestRecommendRoutesRespectShortMaxWalkOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	const shortMaxWalkMeters = 300
	for _, testCase := range officialNetworkCases(graph) {
		routes, err := recommendRoutes(graph, testCase.origin, testCase.destination, 3, weights, shortMaxWalkMeters)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", testCase.name, err)
		}
		assertValidRecommendations(t, testCase, routes, 3, shortMaxWalkMeters, weights)
	}
}

// La misma consulta debe dar siempre la misma respuesta, incluso con empates. Los
// paraderos están en un mapa, cuyo orden cambia en cada recorrido.
func TestRecommendRoutesAreDeterministic(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, testCase := range officialNetworkCases(graph) {
		firstRoutes, _ := recommendRoutes(graph, testCase.origin, testCase.destination, 3, weights, maxWalkDistanceMeters)
		repeatedRoutes, _ := recommendRoutes(graph, testCase.origin, testCase.destination, 3, weights, maxWalkDistanceMeters)
		if !reflect.DeepEqual(firstRoutes, repeatedRoutes) {
			t.Fatalf("%s: the same request returned different routes", testCase.name)
		}
	}
}

// Cada límite se respeta, y pedir más rutas nunca entrega menos.
func TestRecommendRoutesRespectEveryLimit(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	origin := pointNearStop(graph, "PAR-PORTAL-01")
	destination := pointNearStop(graph, "PAR-CJP-02")
	previousCount := 0
	for limit := 1; limit <= maxUniversityRoutes; limit++ {
		routes, err := recommendRoutes(graph, origin, destination, limit, weights, maxWalkDistanceMeters)
		if err != nil {
			t.Fatalf("limit %d: unexpected error: %v", limit, err)
		}
		if len(routes) > limit || len(routes) < previousCount {
			t.Fatalf("limit %d: got %d routes, previous limit got %d", limit, len(routes), previousCount)
		}
		previousCount = len(routes)
	}
}

// La primera ruta es la más barata de todas: ninguna combinación de paraderos de
// salida y llegada tiene una ruta más barata.
func TestRecommendRoutesFirstIsCheapestOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, testCase := range officialNetworkCases(graph) {
		routes, _ := recommendRoutes(graph, testCase.origin, testCase.destination, 1, weights, maxWalkDistanceMeters)
		origins, _ := originEndpoints(graph, testCase.origin, maxWalkDistanceMeters)
		destinations, _ := destinationEndpoints(graph, testCase.destination, maxWalkDistanceMeters)
		for _, start := range origins {
			for _, end := range destinations {
				if start.StopID == end.StopID {
					continue
				}
				path, found := cheapestPath(graph, start.StopID, end.StopID, weights)
				if !found {
					continue
				}
				candidateCost := pathCost(withEndpointWalks(path, start, end), weights)
				if candidateCost < pathCost(routes[0], weights)-1e-9 {
					t.Fatalf("%s: route via %s -> %s costs %v, less than the first %v",
						testCase.name, start.StopID, end.StopID, candidateCost, pathCost(routes[0], weights))
				}
			}
		}
	}
}
