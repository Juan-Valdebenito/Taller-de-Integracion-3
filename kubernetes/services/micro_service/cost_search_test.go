package main

import (
	"fmt"
	"math"
	"math/rand"
	"testing"
)

// cheapestSimplePathCost prueba todos los caminos sin paraderos repetidos y
// devuelve el menor costo. Es lenta, pero sirve como referencia.
func cheapestSimplePathCost(graph *TransitGraph, currentStopID, destinationStopID string, weights CostWeights,
	visitedStops map[string]bool, path []pathStep) (float64, bool) {
	if currentStopID == destinationStopID {
		return pathCost(path, weights), true
	}
	visitedStops[currentStopID] = true
	defer delete(visitedStops, currentStopID)
	bestCost, found := math.Inf(1), false
	for _, edge := range graph.Edges[currentStopID] {
		if visitedStops[edge.ToStopID] {
			continue
		}
		nextPath := append(append([]pathStep{}, path...), pathStep{From: currentStopID, Edge: edge})
		if cost, reached := cheapestSimplePathCost(graph, edge.ToStopID, destinationStopID, weights, visitedStops, nextPath); reached && cost < bestCost {
			bestCost, found = cost, true
		}
	}
	return bestCost, found
}

func assertCheapestPath(t *testing.T, graph *TransitGraph, originStopID, destinationStopID string, weights CostWeights) {
	t.Helper()
	path, found := cheapestPath(graph, originStopID, destinationStopID, weights)
	expectedCost, expectedFound := cheapestSimplePathCost(graph, originStopID, destinationStopID, weights, make(map[string]bool), nil)
	if found != expectedFound {
		t.Fatalf("%s -> %s: se esperaba ruta %v y se obtuvo %v", originStopID, destinationStopID, expectedFound, found)
	}
	if !found {
		return
	}
	actualCost := pathCost(path, weights)
	// Con estados, la búsqueda podría repetir un paradero si eso abarata la ruta.
	// Por eso su costo nunca supera al del mejor camino sin repeticiones.
	if actualCost > expectedCost+1e-9 {
		t.Errorf("%s -> %s: costo %v, pero existe una ruta de %v", originStopID, destinationStopID, actualCost, expectedCost)
	}
}

func TestCheapestPathMatchesBruteForceOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, stopPair := range allStopPairs(graph) {
		assertCheapestPath(t, graph, stopPair[0], stopPair[1], weights)
		// En la red oficial la ruta más barata no repite paraderos, así que el
		// costo debe coincidir exactamente con la fuerza bruta.
		path, _ := cheapestPath(graph, stopPair[0], stopPair[1], weights)
		expectedCost, _ := cheapestSimplePathCost(graph, stopPair[0], stopPair[1], weights, make(map[string]bool), nil)
		if math.Abs(pathCost(path, weights)-expectedCost) > 1e-9 {
			t.Errorf("%s -> %s: costo %v y fuerza bruta %v", stopPair[0], stopPair[1], pathCost(path, weights), expectedCost)
		}
	}
}

func TestCheapestPathMatchesBruteForceOnRandomGraphs(t *testing.T) {
	const graphCount, stopsPerGraph, edgesPerGraph = 40, 7, 20
	routeIDs := []string{"L1", "L2", "L3", walkRouteID}
	for graphSeed := int64(1); graphSeed <= graphCount; graphSeed++ {
		generator := rand.New(rand.NewSource(graphSeed))
		graph := NewTransitGraph()
		stopIDs := make([]string, stopsPerGraph)
		for stopIndex := range stopIDs {
			stopIDs[stopIndex] = fmt.Sprintf("STOP-%d", stopIndex)
			graph.Stops[stopIDs[stopIndex]] = Stop{ID: stopIDs[stopIndex]}
		}
		for edgeIndex := 0; edgeIndex < edgesPerGraph; edgeIndex++ {
			fromStopID := stopIDs[generator.Intn(stopsPerGraph)]
			graph.Edges[fromStopID] = append(graph.Edges[fromStopID], Edge{
				ToStopID:    stopIDs[generator.Intn(stopsPerGraph)],
				RouteID:     routeIDs[generator.Intn(len(routeIDs))],
				BaseTimeSec: 60 + generator.Intn(1200),
			})
		}
		for _, stopPair := range allStopPairs(graph) {
			assertCheapestPath(t, graph, stopPair[0], stopPair[1], defaultCostWeights())
		}
	}
}

func TestCheapestPathAvoidsLineChange(t *testing.T) {
	graph := NewTransitGraph()
	for _, stopID := range []string{"ORIGIN", "MIDDLE", "DESTINATION"} {
		graph.Stops[stopID] = Stop{ID: stopID}
	}
	graph.Edges["ORIGIN"] = []Edge{{ToStopID: "MIDDLE", RouteID: "L1", BaseTimeSec: 600}}
	graph.Edges["MIDDLE"] = []Edge{
		// Cambiar a L2 es 100 s más rápido, pero exige esperar y cambiar de línea.
		{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 500},
		{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 600},
	}
	fastest, _ := fastestPath(graph, "ORIGIN", "DESTINATION")
	cheapest, found := cheapestPath(graph, "ORIGIN", "DESTINATION", defaultCostWeights())
	if !found || fastest[1].Edge.RouteID != "L2" || cheapest[1].Edge.RouteID != "L1" {
		t.Errorf("la más rápida cambia a L2, pero la más barata sigue en L1: %+v / %+v", fastest, cheapest)
	}
}

func TestCheapestPathsAreValidOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, stopPair := range allStopPairs(graph) {
		result := searchCheapestPath(graph, stopPair[0], stopPair[1], weights, noCostEstimate)
		if !result.Found {
			t.Fatalf("sin ruta de %s a %s", stopPair[0], stopPair[1])
		}
		assertPathIsValid(t, result.Path, stopPair[0], stopPair[1])
	}
}

func TestCheapestPathReportsMissingRoute(t *testing.T) {
	graph := NewTransitGraph()
	graph.Stops["ORIGIN"] = Stop{ID: "ORIGIN"}
	graph.Stops["ISOLATED"] = Stop{ID: "ISOLATED"}
	if _, found := cheapestPath(graph, "ORIGIN", "ISOLATED", defaultCostWeights()); found {
		t.Error("un paradero sin aristas no debe tener ruta")
	}
}
