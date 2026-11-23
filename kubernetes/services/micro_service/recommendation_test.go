package main

import (
	"errors"
	"reflect"
	"testing"
)

// assertConnectedRoute revisa que cada tramo parta donde terminó el anterior.
func assertConnectedRoute(t *testing.T, route []pathStep) {
	t.Helper()
	for stepIndex := 1; stepIndex < len(route); stepIndex++ {
		if route[stepIndex].From != route[stepIndex-1].Edge.ToStopID {
			t.Fatalf("step %d starts at %s, but the previous ended at %s", stepIndex, route[stepIndex].From, route[stepIndex-1].Edge.ToStopID)
		}
	}
}

func assertSortedByCost(t *testing.T, routes [][]pathStep, weights CostWeights) {
	t.Helper()
	for routeIndex := 1; routeIndex < len(routes); routeIndex++ {
		if pathCost(routes[routeIndex], weights) < pathCost(routes[routeIndex-1], weights) {
			t.Fatalf("route %d costs less than route %d", routeIndex, routeIndex-1)
		}
	}
}

// Entre dos paraderos no hay caminatas que agregar: el resultado es el mismo de
// las alternativas por costo.
func TestRecommendRoutesBetweenStopsMatchesAlternatives(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, stopPair := range allStopPairs(graph) {
		routes, err := recommendRoutes(graph, stopPoint(stopPair[0]), stopPoint(stopPair[1]), 3, weights, maxWalkDistanceMeters)
		if err != nil {
			t.Fatalf("%s -> %s: unexpected error: %v", stopPair[0], stopPair[1], err)
		}
		expectedRoutes := cheapestAlternativePaths(graph, stopPair[0], stopPair[1], 3, weights)
		if !reflect.DeepEqual(routes, expectedRoutes) {
			t.Fatalf("%s -> %s: routes differ from cheapestAlternativePaths", stopPair[0], stopPair[1])
		}
	}
}

// La micro pasa por BOTH y después por ONLY_ARRIVES, que está más cerca del
// destino. Bajarse en BOTH cuesta 600 + 60 + 278 × 2 = 1216; seguir hasta
// ONLY_ARRIVES cuesta 600 + 120 + 186 × 2 = 1092. Conviene seguir en la micro.
// ONLY_DEPARTS está a unos 111 m del destino, así que caminar directo cuesta
// 93 × 2 = 186 y es la mejor opción; la mejor en micro queda segunda.
func TestRecommendRoutesToLocationGetsOffNearestUsefulStop(t *testing.T) {
	graph := arrivalTestGraph()
	weights := defaultCostWeights()
	destination := locationPoint(destinationTestLatitude, destinationTestLongitude)
	routes, err := recommendRoutes(graph, stopPoint("ONLY_DEPARTS"), destination, 3, weights, maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes) != 3 {
		t.Fatalf("got %d routes, want 3", len(routes))
	}
	if len(routes[0]) != 1 || routes[0][0].From != "ONLY_DEPARTS" {
		t.Fatalf("best route = %+v, want the direct walk", routes[0])
	}
	bestByBus := routes[1]
	if bestByBus[len(bestByBus)-1].From != "ONLY_ARRIVES" {
		t.Fatalf("best bus route gets off at %s, want ONLY_ARRIVES", bestByBus[len(bestByBus)-1].From)
	}
	for _, route := range routes {
		lastStep := route[len(route)-1]
		if lastStep.Edge.ToStopID != destinationLocationID || lastStep.Edge.RouteID != walkRouteID {
			t.Fatalf("route does not end walking to the destination: %+v", lastStep)
		}
		assertConnectedRoute(t, route)
	}
	assertSortedByCost(t, routes, weights)
}

func TestRecommendRoutesFromLocationStartWithWalk(t *testing.T) {
	graph := arrivalTestGraph()
	origin := locationPoint(destinationTestLatitude, destinationTestLongitude)
	routes, err := recommendRoutes(graph, origin, stopPoint("FAR"), 3, defaultCostWeights(), maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes) == 0 {
		t.Fatal("no routes found")
	}
	for _, route := range routes {
		if route[0].From != userLocationID || route[0].Edge.RouteID != walkRouteID {
			t.Fatalf("route does not start walking from the user: %+v", route[0])
		}
		if route[len(route)-1].Edge.ToStopID != "FAR" {
			t.Fatalf("route ends at %s, want FAR", route[len(route)-1].Edge.ToStopID)
		}
		assertConnectedRoute(t, route)
	}
}

// Entre dos coordenadas de la red oficial, cada ruta empieza y termina caminando,
// está conectada y no supera el límite pedido.
func TestRecommendRoutesBetweenLocationsOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	portal, campus := graph.Stops["PAR-PORTAL-01"], graph.Stops["PAR-CJP-02"]
	origin := locationPoint(portal.Latitude+0.0005, portal.Longitude)
	destination := locationPoint(campus.Latitude+0.0005, campus.Longitude)
	routes, err := recommendRoutes(graph, origin, destination, 3, weights, maxWalkDistanceMeters)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes) == 0 || len(routes) > 3 {
		t.Fatalf("got %d routes, want between 1 and 3", len(routes))
	}
	for _, route := range routes {
		if route[0].From != userLocationID || route[len(route)-1].Edge.ToStopID != destinationLocationID {
			t.Fatalf("route does not go from the user to the destination: %+v", route)
		}
		assertConnectedRoute(t, route)
	}
	assertSortedByCost(t, routes, weights)
}

func TestRecommendRoutesReportsErrors(t *testing.T) {
	graph := arrivalTestGraph()
	farAway := locationPoint(destinationTestLatitude-0.1, destinationTestLongitude)
	testCases := []struct {
		name          string
		origin        RoutePoint
		destination   RoutePoint
		expectedError error
	}{
		{"invalid origin", RoutePoint{}, stopPoint("BOTH"), errInvalidRecommendationOrigin},
		{"unknown destination", stopPoint("BOTH"), stopPoint("NOWHERE"), errUnknownDestinationStop},
		{"no stops near origin", farAway, stopPoint("BOTH"), errNoNearbyStops},
		{"no stops near destination", stopPoint("BOTH"), farAway, errNoStopsNearDestination},
	}
	for _, testCase := range testCases {
		_, err := recommendRoutes(graph, testCase.origin, testCase.destination, 3, defaultCostWeights(), maxWalkDistanceMeters)
		if !errors.Is(err, testCase.expectedError) {
			t.Fatalf("%s: error = %v, want %v", testCase.name, err, testCase.expectedError)
		}
	}
}

// Los puntos se validan aunque el límite sea 0, para no ocultar un error.
func TestRecommendRoutesWithZeroLimit(t *testing.T) {
	graph := arrivalTestGraph()
	routes, err := recommendRoutes(graph, stopPoint("ONLY_DEPARTS"), stopPoint("ONLY_ARRIVES"), 0, defaultCostWeights(), maxWalkDistanceMeters)
	if err != nil || routes != nil {
		t.Fatalf("routes = %v, err = %v; want nil, nil", routes, err)
	}
	if _, err := recommendRoutes(graph, RoutePoint{}, stopPoint("ONLY_ARRIVES"), 0, defaultCostWeights(), maxWalkDistanceMeters); err == nil {
		t.Fatal("invalid origin with limit 0 returned no error")
	}
}

// Agregar las caminatas no debe modificar los caminos que entrega la búsqueda.
func TestWithEndpointWalksDoesNotChangePath(t *testing.T) {
	path := []pathStep{{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1", BaseTimeSec: 60}}}
	originalPath := append([]pathStep{}, path...)
	startWalk := pathStep{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 30}}
	endWalk := pathStep{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 40}}
	route := withEndpointWalks(path, routeEndpoint{StopID: "A", Walk: &startWalk}, routeEndpoint{StopID: "B", Walk: &endWalk})
	if len(route) != 3 || route[0] != startWalk || route[2] != endWalk {
		t.Fatalf("route = %+v, want start walk, ride and end walk", route)
	}
	if !reflect.DeepEqual(path, originalPath) {
		t.Fatalf("path changed to %+v", path)
	}
}
