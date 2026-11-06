package main

import (
	"fmt"
	"math"
	"math/rand"
	"testing"
)

func totalPathSeconds(path []pathStep) int {
	totalSeconds := 0
	for _, step := range path {
		totalSeconds += step.Edge.BaseTimeSec
	}
	return totalSeconds
}

// assertAStarMatchesDijkstra compara el tiempo: dos rutas distintas pueden empatar.
func assertAStarMatchesDijkstra(t *testing.T, graph *TransitGraph) {
	t.Helper()
	for originStopID := range graph.Stops {
		for destinationStopID := range graph.Stops {
			if originStopID == destinationStopID {
				continue
			}
			dijkstraRoute, dijkstraFound := fastestPath(graph, originStopID, destinationStopID)
			aStarRoute, aStarFound := aStarPath(graph, originStopID, destinationStopID)
			if dijkstraFound != aStarFound {
				t.Fatalf("%s -> %s: Dijkstra encontró ruta %v y A* %v", originStopID, destinationStopID, dijkstraFound, aStarFound)
			}
			if totalPathSeconds(dijkstraRoute) != totalPathSeconds(aStarRoute) {
				t.Errorf("%s -> %s: Dijkstra tarda %d s y A* %d s", originStopID, destinationStopID,
					totalPathSeconds(dijkstraRoute), totalPathSeconds(aStarRoute))
			}
		}
	}
}

func TestAStarMatchesDijkstraOnOfficialNetwork(t *testing.T) {
	assertAStarMatchesDijkstra(t, loadSeedNetwork(t).buildGraph())
}

func TestAStarMatchesDijkstraOnRandomGraphs(t *testing.T) {
	const graphCount, stopsPerGraph, edgesPerGraph = 40, 12, 30
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
			graph.Edges[fromStopID] = append(graph.Edges[fromStopID], Edge{
				ToStopID: toStopID, RouteID: "L1", BaseTimeSec: 1 + generator.Intn(3000),
			})
		}
		assertAStarMatchesDijkstra(t, graph)
	}
}

func TestAStarFindsHandCalculatedTrip(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	path, found := aStarPath(graph, "PAR-CSF-01", "PAR-MRODRI-01")
	if !found || totalPathSeconds(path) != 420 {
		t.Fatalf("se esperaban 420 s y se obtuvieron %d s", totalPathSeconds(path))
	}
}

func TestAStarReportsMissingRoute(t *testing.T) {
	graph := NewTransitGraph()
	graph.Stops["ORIGIN"] = Stop{ID: "ORIGIN", Latitude: -38.7, Longitude: -72.6}
	graph.Stops["ISOLATED"] = Stop{ID: "ISOLATED", Latitude: -38.71, Longitude: -72.61}
	if _, found := aStarPath(graph, "ORIGIN", "ISOLATED"); found {
		t.Error("un paradero sin aristas no debe tener ruta")
	}
}

func TestRemainingEstimateNeverExceedsRealTime(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	maxSpeedMps := maxStraightSpeedMps(graph)
	if maxSpeedMps <= 0 {
		t.Fatal("la red oficial debe tener una velocidad máxima positiva")
	}
	for originStopID := range graph.Edges {
		for destinationStopID := range graph.Edges {
			path, found := fastestPath(graph, originStopID, destinationStopID)
			if !found {
				t.Fatalf("sin ruta de %s a %s", originStopID, destinationStopID)
			}
			estimate := remainingTimeEstimate(graph, originStopID, destinationStopID, maxSpeedMps)
			if estimate > totalPathSeconds(path) {
				t.Errorf("%s -> %s: estima %d s y tarda %d s", originStopID, destinationStopID, estimate, totalPathSeconds(path))
			}
		}
	}
}

func TestZeroTimeEdgeDisablesEstimate(t *testing.T) {
	graph := NewTransitGraph()
	graph.Stops["ORIGIN"] = Stop{ID: "ORIGIN", Latitude: -38.7, Longitude: -72.6}
	graph.Stops["DESTINATION"] = Stop{ID: "DESTINATION", Latitude: -38.71, Longitude: -72.61}
	graph.Edges["ORIGIN"] = []Edge{{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 0}}
	if maxSpeedMps := maxStraightSpeedMps(graph); maxSpeedMps != 0 {
		t.Fatalf("se esperaba 0 y se obtuvo %f", maxSpeedMps)
	}
	if estimate := remainingTimeEstimate(graph, "ORIGIN", "DESTINATION", 0); estimate != 0 {
		t.Errorf("sin velocidad la estimación debe ser 0, y fue %d", estimate)
	}
}

// compareExploredStops suma los paraderos que explora cada algoritmo en todos los
// viajes indicados, y comprueba que ambos lleguen en el mismo tiempo.
func compareExploredStops(t *testing.T, graph *TransitGraph, stopPairs [][2]string) (dijkstraExplored, aStarExplored int) {
	t.Helper()
	for _, stopPair := range stopPairs {
		originStopID, destinationStopID := stopPair[0], stopPair[1]
		dijkstraResult := searchFastestPath(graph, originStopID, destinationStopID, noRemainingEstimate)
		aStarResult := searchFastestPath(graph, originStopID, destinationStopID, aStarEstimate(graph, destinationStopID))
		if totalPathSeconds(dijkstraResult.Path) != totalPathSeconds(aStarResult.Path) {
			t.Fatalf("%s -> %s: los algoritmos no coinciden en el tiempo", originStopID, destinationStopID)
		}
		dijkstraExplored += dijkstraResult.ExploredStops
		aStarExplored += aStarResult.ExploredStops
	}
	return dijkstraExplored, aStarExplored
}

func allStopPairs(graph *TransitGraph) [][2]string {
	stopPairs := make([][2]string, 0)
	for originStopID := range graph.Stops {
		for destinationStopID := range graph.Stops {
			if originStopID != destinationStopID {
				stopPairs = append(stopPairs, [2]string{originStopID, destinationStopID})
			}
		}
	}
	return stopPairs
}

// buildGridGraph crea una red de prueba mucho mayor que la real, con calles en
// ambos sentidos y tiempos variados, para medir la diferencia entre algoritmos.
func buildGridGraph(gridSize int) *TransitGraph {
	const degreesBetweenStops, baseSpeedMps = 0.002, 5.0
	generator := rand.New(rand.NewSource(1))
	graph := NewTransitGraph()
	stopIDAt := func(row, column int) string { return fmt.Sprintf("GRID-%d-%d", row, column) }
	for row := 0; row < gridSize; row++ {
		for column := 0; column < gridSize; column++ {
			stopID := stopIDAt(row, column)
			graph.Stops[stopID] = Stop{
				ID:        stopID,
				Latitude:  -38.80 + float64(row)*degreesBetweenStops,
				Longitude: -72.79 + float64(column)*degreesBetweenStops,
			}
		}
	}
	connect := func(fromStopID, toStopID string) {
		meters := straightMeters(graph, fromStopID, toStopID)
		congestion := 1 + generator.Float64()
		seconds := int(math.Ceil(meters / baseSpeedMps * congestion))
		graph.Edges[fromStopID] = append(graph.Edges[fromStopID], Edge{ToStopID: toStopID, RouteID: "GRID", BaseTimeSec: seconds})
		graph.Edges[toStopID] = append(graph.Edges[toStopID], Edge{ToStopID: fromStopID, RouteID: "GRID", BaseTimeSec: seconds})
	}
	for row := 0; row < gridSize; row++ {
		for column := 0; column < gridSize; column++ {
			if column+1 < gridSize {
				connect(stopIDAt(row, column), stopIDAt(row, column+1))
			}
			if row+1 < gridSize {
				connect(stopIDAt(row, column), stopIDAt(row+1, column))
			}
		}
	}
	return graph
}

func TestAStarExploresNoMoreStopsOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	dijkstraExplored, aStarExplored := compareExploredStops(t, graph, allStopPairs(graph))
	t.Logf("red oficial: Dijkstra explora %d paraderos y A* %d", dijkstraExplored, aStarExplored)
	if aStarExplored > dijkstraExplored {
		t.Errorf("A* exploró %d paraderos y Dijkstra %d", aStarExplored, dijkstraExplored)
	}
}

func TestAStarExploresFewerStopsOnLargeGrid(t *testing.T) {
	const gridSize, sampledTrips = 40, 200
	graph := buildGridGraph(gridSize)
	generator := rand.New(rand.NewSource(2))
	stopPairs := make([][2]string, 0, sampledTrips)
	for len(stopPairs) < sampledTrips {
		originStopID := fmt.Sprintf("GRID-%d-%d", generator.Intn(gridSize), generator.Intn(gridSize))
		destinationStopID := fmt.Sprintf("GRID-%d-%d", generator.Intn(gridSize), generator.Intn(gridSize))
		if originStopID != destinationStopID {
			stopPairs = append(stopPairs, [2]string{originStopID, destinationStopID})
		}
	}
	dijkstraExplored, aStarExplored := compareExploredStops(t, graph, stopPairs)
	t.Logf("cuadrícula de %d paraderos: Dijkstra explora %d y A* %d en %d viajes",
		len(graph.Stops), dijkstraExplored, aStarExplored, sampledTrips)
	if aStarExplored >= dijkstraExplored {
		t.Errorf("A* debe explorar menos: exploró %d y Dijkstra %d", aStarExplored, dijkstraExplored)
	}
}
