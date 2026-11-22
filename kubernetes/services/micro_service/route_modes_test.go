package main

import (
	"fmt"
	"math/rand"
	"testing"
)

// buildRandomGraph crea un grafo pequeño al azar, con tiempos y distancias, igual
// para una misma semilla. Incluye caminatas, para probar least_walk.
func buildRandomGraph(graphSeed int64) *TransitGraph {
	const stopsPerGraph, edgesPerGraph = 7, 20
	routeIDs := []string{"L1", "L2", "L3", walkRouteID}
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
			DistanceM:   100 + generator.Intn(3000),
		})
	}
	return graph
}

// bestSimplePath prueba todos los caminos sin paraderos repetidos y devuelve el
// costo del mejor según isBetter. Es lenta, pero sirve como referencia.
func bestSimplePath(graph *TransitGraph, currentStopID, destinationStopID string, visitedStops map[string]bool,
	path []pathStep, isBetter func(candidate, best []pathStep) bool) ([]pathStep, bool) {
	if currentStopID == destinationStopID {
		return append([]pathStep{}, path...), true
	}
	visitedStops[currentStopID] = true
	defer delete(visitedStops, currentStopID)
	var bestPath []pathStep
	found := false
	for _, edge := range graph.Edges[currentStopID] {
		if visitedStops[edge.ToStopID] {
			continue
		}
		nextPath := append(append([]pathStep{}, path...), pathStep{From: currentStopID, Edge: edge})
		candidate, reached := bestSimplePath(graph, edge.ToStopID, destinationStopID, visitedStops, nextPath, isBetter)
		if reached && (!found || isBetter(candidate, bestPath)) {
			bestPath, found = candidate, true
		}
	}
	return bestPath, found
}

func pathDistanceMeters(path []pathStep) int {
	totalMeters := 0
	for _, step := range path {
		totalMeters += step.Edge.DistanceM
	}
	return totalMeters
}

func pathWalkAndTime(path []pathStep) walkAndTime {
	return walkAndTime{walkSeconds: pathWalkSeconds(path), totalSeconds: pathTotalSeconds(path)}
}

// En la red oficial y en grafos aleatorios, shortestPath da la menor distancia
// que encuentra la fuerza bruta.
func TestShortestPathMatchesBruteForce(t *testing.T) {
	isShorter := func(candidate, best []pathStep) bool { return pathDistanceMeters(candidate) < pathDistanceMeters(best) }
	graphs := []*TransitGraph{loadSeedNetwork(t).buildGraph()}
	for seed := int64(1); seed <= 20; seed++ {
		graphs = append(graphs, buildRandomGraph(seed))
	}
	for graphIndex, graph := range graphs {
		for _, stopPair := range allStopPairs(graph) {
			path, found := shortestPath(graph, stopPair[0], stopPair[1])
			expectedPath, expectedFound := bestSimplePath(graph, stopPair[0], stopPair[1], make(map[string]bool), nil, isShorter)
			if found != expectedFound {
				t.Fatalf("graph %d, %s -> %s: found = %v, want %v", graphIndex, stopPair[0], stopPair[1], found, expectedFound)
			}
			if found && pathDistanceMeters(path) != pathDistanceMeters(expectedPath) {
				t.Fatalf("graph %d, %s -> %s: %d m, but there is a route of %d m",
					graphIndex, stopPair[0], stopPair[1], pathDistanceMeters(path), pathDistanceMeters(expectedPath))
			}
		}
	}
}

// leastWalkingPath camina lo mínimo y, si empata, es la más rápida, igual que la
// fuerza bruta.
func TestLeastWalkingPathMatchesBruteForce(t *testing.T) {
	walksLess := func(candidate, best []pathStep) bool {
		return pathWalkAndTime(candidate).isBetterThan(pathWalkAndTime(best))
	}
	graphs := []*TransitGraph{loadSeedNetwork(t).buildGraph()}
	for seed := int64(1); seed <= 20; seed++ {
		graphs = append(graphs, buildRandomGraph(seed))
	}
	for graphIndex, graph := range graphs {
		for _, stopPair := range allStopPairs(graph) {
			path, found := leastWalkingPath(graph, stopPair[0], stopPair[1])
			expectedPath, expectedFound := bestSimplePath(graph, stopPair[0], stopPair[1], make(map[string]bool), nil, walksLess)
			if found != expectedFound {
				t.Fatalf("graph %d, %s -> %s: found = %v, want %v", graphIndex, stopPair[0], stopPair[1], found, expectedFound)
			}
			if found && pathWalkAndTime(path) != pathWalkAndTime(expectedPath) {
				t.Fatalf("graph %d, %s -> %s: %+v, but there is a route with %+v",
					graphIndex, stopPair[0], stopPair[1], pathWalkAndTime(path), pathWalkAndTime(expectedPath))
			}
		}
	}
}

// Caminar 300 s directo, o ir en micro 600 s: least_walk prefiere la micro.
func TestLeastWalkingPathPrefersBusOverWalking(t *testing.T) {
	graph := twoRouteGraph([]string{"ORIGIN", "DESTINATION"}, map[string][]Edge{
		"ORIGIN": {
			{ToStopID: "DESTINATION", RouteID: walkRouteID, BaseTimeSec: 300, DistanceM: 360},
			{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 600, DistanceM: 2000},
		},
	})
	path, found := leastWalkingPath(graph, "ORIGIN", "DESTINATION")
	if !found || len(path) != 1 || path[0].Edge.RouteID != "L1" {
		t.Fatalf("path = %+v, want the bus", path)
	}
	shortest, _ := shortestPath(graph, "ORIGIN", "DESTINATION")
	if len(shortest) != 1 || shortest[0].Edge.RouteID != walkRouteID {
		t.Fatalf("shortest = %+v, want the 360 m walk", shortest)
	}
}

func TestRouteModesReportMissingRoute(t *testing.T) {
	graph := twoRouteGraph([]string{"ORIGIN", "DESTINATION"}, map[string][]Edge{})
	if _, found := shortestPath(graph, "ORIGIN", "DESTINATION"); found {
		t.Fatal("shortestPath found a route that does not exist")
	}
	if _, found := leastWalkingPath(graph, "ORIGIN", "DESTINATION"); found {
		t.Fatal("leastWalkingPath found a route that does not exist")
	}
}
