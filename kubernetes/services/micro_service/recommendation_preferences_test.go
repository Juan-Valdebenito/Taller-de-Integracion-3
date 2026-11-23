package main

// Pruebas de las preferencias a través del planificador, en la red oficial.
//
// Varias pruebas comparan la mejor ruta con dos preferencias distintas. Las
// opciones posibles son las mismas en ambos casos; solo cambian los pesos. Si los
// pesos de una preferencia solo agregan costo a algo (caminar, cambiar de línea,
// ir en micro llena), su mejor ruta nunca tiene más de eso: si lo tuviera, la otra
// ruta sería más barata también con esos pesos.

import (
	"errors"
	"reflect"
	"testing"
)

// bestRecommendation pide la mejor ruta con las preferencias indicadas.
func bestRecommendation(t *testing.T, graph *TransitGraph, testCase recommendationCase, preferences RoutePreferences, occupancy LineOccupancy) []pathStep {
	t.Helper()
	weights := preferenceCostWeights(preferences, occupancy, nil)
	routes, err := recommendRoutes(graph, testCase.origin, testCase.destination, 1, weights, preferences.MaxWalkMeters)
	if err != nil {
		t.Fatalf("%s: unexpected error: %v", testCase.name, err)
	}
	return routes[0]
}

func TestLeastWalkingNeverWalksMoreThanBalanced(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	for _, testCase := range officialNetworkCases(graph) {
		balanced := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, true), nil)
		leastWalking := bestRecommendation(t, graph, testCase, preferencesWith(priorityLeastWalking, true), nil)
		if pathWalkSeconds(leastWalking) > pathWalkSeconds(balanced) {
			t.Fatalf("%s: least_walking walks %d s, balanced %d s", testCase.name, pathWalkSeconds(leastWalking), pathWalkSeconds(balanced))
		}
	}
}

func TestFewestTransfersNeverHasMoreTransfersThanBalanced(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	for _, testCase := range officialNetworkCases(graph) {
		balanced := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, true), nil)
		fewestTransfers := bestRecommendation(t, graph, testCase, preferencesWith(priorityFewestTransfers, true), nil)
		if countTransfers(fewestTransfers) > countTransfers(balanced) {
			t.Fatalf("%s: fewest_transfers has %d transfers, balanced %d", testCase.name, countTransfers(fewestTransfers), countTransfers(balanced))
		}
	}
}

// Con fastest, el costo es el tiempo real con la espera incluida. Su mejor ruta
// nunca tarda más que la de balanced.
func TestFastestNeverTakesLongerThanBalanced(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	realTimeWeights := priorityCostWeights(priorityFastest)
	for _, testCase := range officialNetworkCases(graph) {
		balanced := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, true), nil)
		fastest := bestRecommendation(t, graph, testCase, preferencesWith(priorityFastest, true), nil)
		if pathCost(fastest, realTimeWeights) > pathCost(balanced, realTimeWeights)+1e-9 {
			t.Fatalf("%s: fastest takes %v s, balanced %v s", testCase.name, pathCost(fastest, realTimeWeights), pathCost(balanced, realTimeWeights))
		}
	}
}

// Una caminata máxima más larga solo agrega opciones: la mejor ruta nunca sale
// más cara. Con cualquier valor, ninguna caminata lo supera.
func TestLongerMaxWalkNeverGivesMoreExpensiveRoute(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	maxWalkValues := []int{minPreferredWalkMeters, 300, 600, maxPreferredWalkMeters}
	for _, testCase := range officialNetworkCases(graph) {
		previousBestCost := -1.0
		for _, maxWalkMeters := range maxWalkValues {
			routes, err := recommendRoutes(graph, testCase.origin, testCase.destination, 1, weights, maxWalkMeters)
			if errors.Is(err, errNoNearbyStops) || errors.Is(err, errNoStopsNearDestination) {
				continue
			}
			if err != nil {
				t.Fatalf("%s with %d m: unexpected error: %v", testCase.name, maxWalkMeters, err)
			}
			assertValidRecommendations(t, testCase, routes, 1, maxWalkMeters, weights)
			bestCost := pathCost(routes[0], weights)
			if previousBestCost >= 0 && bestCost > previousBestCost+1e-9 {
				t.Fatalf("%s: with %d m the best costs %v, more than %v with a shorter walk", testCase.name, maxWalkMeters, bestCost, previousBestCost)
			}
			previousBestCost = bestCost
		}
	}
}

// fullLinesOccupancy deja todas las líneas de la red muy llenas, salvo una.
func fullLinesOccupancy(graph *TransitGraph, emptyRouteID string) LineOccupancy {
	occupancy := make(LineOccupancy)
	for _, edges := range graph.Edges {
		for _, edge := range edges {
			if edge.RouteID != walkRouteID && edge.RouteID != emptyRouteID {
				occupancy[edge.RouteID] = 0.95
			}
		}
	}
	return occupancy
}

// Sin evitar micros llenas, la ocupación no cambia nada: las rutas son las mismas
// que sin datos de ocupación.
func TestNotAvoidingCrowdingIgnoresOccupancy(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	occupancy := fullLinesOccupancy(graph, "L1C")
	for _, testCase := range officialNetworkCases(graph) {
		withoutData := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, false), nil)
		withFullLines := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, false), occupancy)
		if !reflect.DeepEqual(withoutData, withFullLines) {
			t.Fatalf("%s: occupancy changed the route although avoid_crowding is false", testCase.name)
		}
	}
}

// Evitando micros llenas, la mejor ruta nunca tiene más recargo por ocupación que
// la que se elige sin evitarlas.
func TestAvoidingCrowdingNeverRidesMoreCrowded(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	occupancy := fullLinesOccupancy(graph, "L1C")
	crowdingWeights := preferenceCostWeights(preferencesWith(priorityBalanced, true), occupancy, nil)
	changedRoutes := 0
	for _, testCase := range officialNetworkCases(graph) {
		ignoring := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, false), occupancy)
		avoiding := bestRecommendation(t, graph, testCase, preferencesWith(priorityBalanced, true), occupancy)
		ignoringCrowding := pathCostBreakdown(ignoring, crowdingWeights).Crowding
		avoidingCrowding := pathCostBreakdown(avoiding, crowdingWeights).Crowding
		if avoidingCrowding > ignoringCrowding+1e-9 {
			t.Fatalf("%s: avoiding crowding costs %v of crowding, ignoring it %v", testCase.name, avoidingCrowding, ignoringCrowding)
		}
		if !reflect.DeepEqual(ignoring, avoiding) {
			changedRoutes++
		}
	}
	// Si ninguna ruta cambiara, la prueba no estaría comparando nada.
	if changedRoutes == 0 {
		t.Fatal("avoiding crowding never changed a route; the test compares nothing")
	}
	t.Logf("avoiding crowding changed %d routes", changedRoutes)
}
