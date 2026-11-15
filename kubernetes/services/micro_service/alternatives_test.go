package main

import (
	"fmt"
	"math/rand"
	"sort"
	"testing"
)

func threeRouteGraph() *TransitGraph {
	graph := NewTransitGraph()
	for stopIndex, stopID := range []string{"ORIGIN", "NORTH", "SOUTH", "DESTINATION"} {
		graph.Stops[stopID] = Stop{ID: stopID, Latitude: -38.70 - float64(stopIndex)*0.01, Longitude: -72.60}
	}
	graph.Edges["ORIGIN"] = []Edge{
		{ToStopID: "NORTH", RouteID: "L1", TripID: "L1-IDA", BaseTimeSec: 100},
		{ToStopID: "SOUTH", RouteID: "L2", TripID: "L2-IDA", BaseTimeSec: 200},
		{ToStopID: "DESTINATION", RouteID: "L3", TripID: "L3-IDA", BaseTimeSec: 500},
	}
	graph.Edges["NORTH"] = []Edge{{ToStopID: "DESTINATION", RouteID: "L1", TripID: "L1-IDA", BaseTimeSec: 100}}
	graph.Edges["SOUTH"] = []Edge{{ToStopID: "DESTINATION", RouteID: "L2", TripID: "L2-IDA", BaseTimeSec: 200}}
	return graph
}

func pathTimes(paths [][]pathStep) []int {
	times := make([]int, 0, len(paths))
	for _, path := range paths {
		times = append(times, pathSeconds(path))
	}
	return times
}

func assertTimes(t *testing.T, actualTimes, expectedTimes []int) {
	t.Helper()
	if fmt.Sprint(actualTimes) != fmt.Sprint(expectedTimes) {
		t.Errorf("se esperaban los tiempos %v y se obtuvieron %v", expectedTimes, actualTimes)
	}
}

func TestAlternativePathsAreSortedByTime(t *testing.T) {
	paths := alternativePaths(threeRouteGraph(), "ORIGIN", "DESTINATION", 3)
	assertTimes(t, pathTimes(paths), []int{200, 400, 500})
}

func TestAlternativePathsRespectLimit(t *testing.T) {
	paths := alternativePaths(threeRouteGraph(), "ORIGIN", "DESTINATION", 2)
	assertTimes(t, pathTimes(paths), []int{200, 400})
}

func TestAlternativePathsStopWhenNoMoreRoutesExist(t *testing.T) {
	paths := alternativePaths(threeRouteGraph(), "ORIGIN", "DESTINATION", 10)
	assertTimes(t, pathTimes(paths), []int{200, 400, 500})
}

func TestAlternativePathsHandleInvalidRequests(t *testing.T) {
	graph := threeRouteGraph()
	if paths := alternativePaths(graph, "ORIGIN", "ORIGIN", 3); paths != nil {
		t.Error("un viaje sin desplazamiento no debe tener rutas")
	}
	if paths := alternativePaths(graph, "ORIGIN", "DESTINATION", 0); paths != nil {
		t.Error("un límite de 0 no debe entregar rutas")
	}
	if paths := alternativePaths(graph, "DESTINATION", "ORIGIN", 3); paths != nil {
		t.Error("sin conexión no debe haber rutas")
	}
}

func TestAlternativePathsDoNotChangeOriginalGraph(t *testing.T) {
	graph := threeRouteGraph()
	edgesBefore := graph.EdgeCount()
	alternativePaths(graph, "ORIGIN", "DESTINATION", 3)
	if graph.EdgeCount() != edgesBefore {
		t.Errorf("el grafo pasó de %d a %d aristas", edgesBefore, graph.EdgeCount())
	}
}

func TestAlternativePathsOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	const alternativesPerTrip = 3
	for _, stopPair := range allStopPairs(graph) {
		originStopID, destinationStopID := stopPair[0], stopPair[1]
		paths := alternativePaths(graph, originStopID, destinationStopID, alternativesPerTrip)
		if len(paths) == 0 || len(paths) > alternativesPerTrip {
			t.Fatalf("%s -> %s entregó %d rutas", originStopID, destinationStopID, len(paths))
		}
		fastestRoute, _ := fastestPath(graph, originStopID, destinationStopID)
		if pathSeconds(paths[0]) != pathSeconds(fastestRoute) {
			t.Errorf("%s -> %s: la primera ruta no es la más rápida", originStopID, destinationStopID)
		}
		knownConnections := make(map[string]bool)
		for _, path := range paths {
			assertPathIsValid(t, path, originStopID, destinationStopID)
			connections := pathConnections(path)
			if knownConnections[connections] {
				t.Errorf("%s -> %s repite la ruta %s", originStopID, destinationStopID, connections)
			}
			knownConnections[connections] = true
			for _, step := range path {
				if step.Edge.RouteID == walkRouteID && step.Edge.DistanceM > maxWalkDistanceMeters {
					t.Errorf("%s -> %s camina %d m", originStopID, destinationStopID, step.Edge.DistanceM)
				}
			}
		}
	}
}

// pathConnections describe la ruta como la ve el pasajero, sin importar la línea.
func pathConnections(path []pathStep) string {
	connections := ""
	for _, step := range path {
		connections += fmt.Sprintf("%s>%+v|", step.From, connectionKeyOf(step.Edge))
	}
	return connections
}

func TestAlternativePathsAvoidNeedlessLineChanges(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	paths := alternativePaths(graph, "PAR-PORTAL-01", "PAR-CJP-01", 3)
	if len(paths) == 0 {
		t.Fatal("se esperaba al menos una ruta")
	}
	if transfers := countTransfers(paths[0]); transfers != 0 {
		t.Errorf("la línea 7B hace todo el viaje, pero la ruta tiene %d cambios", transfers)
	}
	if pathSeconds(paths[0]) != 1860 {
		t.Errorf("se esperaban 1860 s y se obtuvieron %d s", pathSeconds(paths[0]))
	}
}

func TestDistinctConnectionGraphKeepsFastestEdge(t *testing.T) {
	graph := NewTransitGraph()
	graph.Edges["ORIGIN"] = []Edge{
		{ToStopID: "DESTINATION", RouteID: "SLOW", BaseTimeSec: 300},
		{ToStopID: "DESTINATION", RouteID: "FAST", BaseTimeSec: 100},
		{ToStopID: "DESTINATION", RouteID: walkRouteID, BaseTimeSec: 900, DistanceM: maxWalkDistanceMeters},
		{ToStopID: "FAR", RouteID: walkRouteID, BaseTimeSec: 900, DistanceM: maxWalkDistanceMeters + 1},
	}
	edges := distinctConnectionGraph(graph).Edges["ORIGIN"]
	if len(edges) != 2 || edges[0].RouteID != "FAST" || edges[1].RouteID != walkRouteID {
		t.Errorf("se esperaba la micro rápida y la caminata permitida: %+v", edges)
	}
}

func TestAssignFewestTransfersKeepsSlowerLinesOut(t *testing.T) {
	graph := NewTransitGraph()
	graph.Edges["ORIGIN"] = []Edge{
		{ToStopID: "MIDDLE", RouteID: "L1", BaseTimeSec: 100},
		{ToStopID: "MIDDLE", RouteID: "L2", BaseTimeSec: 100},
		{ToStopID: "MIDDLE", RouteID: "L3", BaseTimeSec: 200},
	}
	graph.Edges["MIDDLE"] = []Edge{{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 100}}
	path := []pathStep{{From: "ORIGIN", Edge: graph.Edges["ORIGIN"][0]}, {From: "MIDDLE", Edge: graph.Edges["MIDDLE"][0]}}
	assignedPath := assignFewestTransfers(graph, path)
	if assignedPath[0].Edge.RouteID != "L2" || countTransfers(assignedPath) != 0 {
		t.Errorf("se esperaba viajar en L2 sin cambios: %+v", assignedPath)
	}
	if pathSeconds(assignedPath) != pathSeconds(path) {
		t.Error("asignar líneas no debe cambiar el tiempo")
	}
}

func assertPathIsValid(t *testing.T, path []pathStep, originStopID, destinationStopID string) {
	t.Helper()
	visitedStops := map[string]bool{originStopID: true}
	currentStopID := originStopID
	for _, step := range path {
		if step.From != currentStopID {
			t.Fatalf("la ruta se corta en %s", currentStopID)
		}
		currentStopID = step.Edge.ToStopID
		if visitedStops[currentStopID] {
			t.Fatalf("la ruta repite el paradero %s", currentStopID)
		}
		visitedStops[currentStopID] = true
	}
	if currentStopID != destinationStopID {
		t.Fatalf("la ruta termina en %s y no en %s", currentStopID, destinationStopID)
	}
}

// allSimplePathTimes prueba todos los caminos posibles. Es lenta, pero muy simple:
// sirve como referencia para comprobar que Yen encuentra las mejores rutas.
func allSimplePathTimes(graph *TransitGraph, currentStopID, destinationStopID string, visitedStops map[string]bool, elapsedSeconds int) []int {
	if currentStopID == destinationStopID {
		return []int{elapsedSeconds}
	}
	visitedStops[currentStopID] = true
	defer delete(visitedStops, currentStopID)
	times := make([]int, 0)
	for _, edge := range graph.Edges[currentStopID] {
		if !visitedStops[edge.ToStopID] {
			times = append(times, allSimplePathTimes(graph, edge.ToStopID, destinationStopID, visitedStops, elapsedSeconds+edge.BaseTimeSec)...)
		}
	}
	return times
}

func TestYenMatchesBruteForceOnRandomGraphs(t *testing.T) {
	const graphCount, stopsPerGraph, edgesPerGraph, alternativesPerTrip = 30, 8, 22, 5
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
			fromStopID := stopIDs[generator.Intn(stopsPerGraph)]
			toStopID := stopIDs[generator.Intn(stopsPerGraph)]
			if fromStopID == toStopID {
				continue
			}
			graph.Edges[fromStopID] = append(graph.Edges[fromStopID], Edge{
				ToStopID: toStopID, RouteID: "L1", TripID: fmt.Sprintf("TRIP-%d", edgeIndex), BaseTimeSec: 1 + generator.Intn(3000),
			})
		}
		for _, stopPair := range allStopPairs(graph) {
			expectedTimes := allSimplePathTimes(graph, stopPair[0], stopPair[1], make(map[string]bool), 0)
			sort.Ints(expectedTimes)
			if len(expectedTimes) > alternativesPerTrip {
				expectedTimes = expectedTimes[:alternativesPerTrip]
			}
			actualTimes := pathTimes(yenPaths(graph, stopPair[0], stopPair[1], alternativesPerTrip))
			if fmt.Sprint(actualTimes) != fmt.Sprint(expectedTimes) {
				t.Fatalf("grafo %d, %s -> %s: se esperaba %v y se obtuvo %v", graphSeed, stopPair[0], stopPair[1], expectedTimes, actualTimes)
			}
		}
	}
}
