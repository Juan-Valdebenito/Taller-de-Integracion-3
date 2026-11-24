package main

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"testing"
)

// allSimplePathCosts prueba todos los caminos sin paraderos repetidos y devuelve
// sus costos. Es lenta, pero sirve como referencia para Yen.
func allSimplePathCosts(graph *TransitGraph, currentStopID, destinationStopID string, weights CostWeights,
	visitedStops map[string]bool, path []pathStep) []float64 {
	if currentStopID == destinationStopID {
		return []float64{pathCost(path, weights)}
	}
	visitedStops[currentStopID] = true
	defer delete(visitedStops, currentStopID)
	costs := make([]float64, 0)
	for _, edge := range graph.Edges[currentStopID] {
		if !visitedStops[edge.ToStopID] {
			nextPath := append(append([]pathStep{}, path...), pathStep{From: currentStopID, Edge: edge})
			costs = append(costs, allSimplePathCosts(graph, edge.ToStopID, destinationStopID, weights, visitedStops, nextPath)...)
		}
	}
	return costs
}

func assertCostsEqual(t *testing.T, label string, actualCosts, expectedCosts []float64) {
	t.Helper()
	if len(actualCosts) != len(expectedCosts) {
		t.Fatalf("%s: se esperaban los costos %v y se obtuvieron %v", label, expectedCosts, actualCosts)
	}
	for costIndex := range actualCosts {
		if math.Abs(actualCosts[costIndex]-expectedCosts[costIndex]) > 1e-9 {
			t.Fatalf("%s: se esperaban los costos %v y se obtuvieron %v", label, expectedCosts, actualCosts)
		}
	}
}

func pathCosts(paths [][]pathStep, weights CostWeights) []float64 {
	costs := make([]float64, 0, len(paths))
	for _, path := range paths {
		costs = append(costs, pathCost(path, weights))
	}
	return costs
}

func cheapestSimpleCosts(graph *TransitGraph, originStopID, destinationStopID string, weights CostWeights, limit int) []float64 {
	expectedCosts := allSimplePathCosts(graph, originStopID, destinationStopID, weights, make(map[string]bool), nil)
	sort.Float64s(expectedCosts)
	if len(expectedCosts) > limit {
		expectedCosts = expectedCosts[:limit]
	}
	return expectedCosts
}

func TestCostYenMatchesBruteForceOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	const pathsPerTrip = 5
	for _, stopPair := range allStopPairs(graph) {
		expectedCosts := cheapestSimpleCosts(graph, stopPair[0], stopPair[1], weights, pathsPerTrip)
		actualCosts := pathCosts(costYenPaths(graph, stopPair[0], stopPair[1], pathsPerTrip, weights), weights)
		assertCostsEqual(t, stopPair[0]+" -> "+stopPair[1], actualCosts, expectedCosts)
	}
}

func TestCostYenMatchesBruteForceOnRandomGraphs(t *testing.T) {
	const graphCount, stopsPerGraph, edgesPerGraph, pathsPerTrip = 30, 7, 18, 4
	routeIDs := []string{"L1", "L2", "L3", walkRouteID}
	weights := defaultCostWeights()
	for graphSeed := int64(1); graphSeed <= graphCount; graphSeed++ {
		generator := rand.New(rand.NewSource(graphSeed))
		graph := NewTransitGraph()
		stopIDs := make([]string, stopsPerGraph)
		for stopIndex := range stopIDs {
			stopIDs[stopIndex] = fmt.Sprintf("STOP-%d", stopIndex)
			graph.Stops[stopIDs[stopIndex]] = Stop{
				ID:        stopIDs[stopIndex],
				Latitude:  -38.80 + generator.Float64()*0.14,
				Longitude: -72.79 + generator.Float64()*0.32,
			}
		}
		for edgeIndex := 0; edgeIndex < edgesPerGraph; edgeIndex++ {
			fromStopID, toStopID := stopIDs[generator.Intn(stopsPerGraph)], stopIDs[generator.Intn(stopsPerGraph)]
			if fromStopID == toStopID {
				continue
			}
			graph.Edges[fromStopID] = append(graph.Edges[fromStopID], Edge{
				ToStopID: toStopID, RouteID: routeIDs[generator.Intn(len(routeIDs))],
				TripID: fmt.Sprintf("TRIP-%d", edgeIndex), BaseTimeSec: 60 + generator.Intn(1200),
			})
		}
		for _, stopPair := range allStopPairs(graph) {
			expectedCosts := cheapestSimpleCosts(graph, stopPair[0], stopPair[1], weights, pathsPerTrip)
			actualCosts := pathCosts(costYenPaths(graph, stopPair[0], stopPair[1], pathsPerTrip, weights), weights)
			assertCostsEqual(t, fmt.Sprintf("grafo %d, %s -> %s", graphSeed, stopPair[0], stopPair[1]), actualCosts, expectedCosts)
		}
	}
}

func TestCheapestAlternativesAreDistinctAndValid(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	const alternativesPerTrip = 3
	for _, stopPair := range allStopPairs(graph) {
		paths := cheapestAlternativePaths(graph, stopPair[0], stopPair[1], alternativesPerTrip, weights)
		if len(paths) == 0 || len(paths) > alternativesPerTrip {
			t.Fatalf("%s -> %s entregó %d rutas", stopPair[0], stopPair[1], len(paths))
		}
		knownSequences := make(map[string]bool)
		for pathIndex, path := range paths {
			assertPathIsValid(t, path, stopPair[0], stopPair[1])
			if knownSequences[connectionSequenceKey(path)] {
				t.Errorf("%s -> %s repite un recorrido", stopPair[0], stopPair[1])
			}
			knownSequences[connectionSequenceKey(path)] = true
			if pathIndex > 0 && pathCost(paths[pathIndex-1], weights) > pathCost(path, weights) {
				t.Errorf("%s -> %s no está ordenado por costo", stopPair[0], stopPair[1])
			}
			for _, step := range path {
				if step.Edge.RouteID == walkRouteID && step.Edge.DistanceM > maxWalkDistanceMeters {
					t.Errorf("%s -> %s camina %d m", stopPair[0], stopPair[1], step.Edge.DistanceM)
				}
			}
		}
		cheapestRoute, _ := cheapestPath(withoutLongWalks(graph), stopPair[0], stopPair[1], weights)
		if math.Abs(pathCost(paths[0], weights)-pathCost(cheapestRoute, weights)) > 1e-9 {
			t.Errorf("%s -> %s: la primera ruta no es la más barata", stopPair[0], stopPair[1])
		}
	}
}

func TestCheapestAlternativesKeepCheapestLineVariant(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	paths := cheapestAlternativePaths(graph, "PAR-PORTAL-01", "PAR-CJP-01", 3, defaultCostWeights())
	if len(paths) == 0 {
		t.Fatal("se esperaba al menos una ruta")
	}
	// La 7B hace todo el viaje: no conviene cambiar de línea en el tramo compartido.
	if countTransfers(paths[0]) != 0 || pathSeconds(paths[0]) != 1860 {
		t.Errorf("se esperaba la 7B sin cambios: %+v", paths[0])
	}
}

func TestCheapestAlternativesHandleInvalidRequests(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	if paths := cheapestAlternativePaths(graph, "PAR-CSF-01", "PAR-CSF-01", 3, weights); paths != nil {
		t.Error("un viaje sin desplazamiento no debe tener rutas")
	}
	if paths := cheapestAlternativePaths(graph, "PAR-CSF-01", "PAR-MRODRI-01", 0, weights); paths != nil {
		t.Error("un límite de 0 no debe entregar rutas")
	}
}
