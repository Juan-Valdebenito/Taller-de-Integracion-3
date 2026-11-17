package main

// Pruebas de que cada prioridad elige la ruta que debería. Los grafos son
// pequeños y sus tiempos están calculados para que balanced elija una ruta y la
// prioridad probada elija la otra. Todas las micros esperan 300 s en promedio.

import (
	"reflect"
	"testing"
)

// twoRouteGraph crea un grafo con los paraderos indicados y las aristas dadas.
func twoRouteGraph(stopIDs []string, edgesByStop map[string][]Edge) *TransitGraph {
	graph := NewTransitGraph()
	for _, stopID := range stopIDs {
		graph.Stops[stopID] = Stop{ID: stopID}
	}
	for stopID, edges := range edgesByStop {
		graph.Edges[stopID] = edges
	}
	return graph
}

// routeSequence devuelve las líneas de cada tramo, para comparar rutas.
func routeSequence(path []pathStep) []string {
	routeIDs := make([]string, 0, len(path))
	for _, step := range path {
		routeIDs = append(routeIDs, step.Edge.RouteID)
	}
	return routeIDs
}

// assertPriorityRoute revisa la ruta que elige una prioridad.
func assertPriorityRoute(t *testing.T, graph *TransitGraph, priority RoutePriority, expectedRouteIDs []string) {
	t.Helper()
	path, found := cheapestPath(graph, "ORIGIN", "DESTINATION", priorityCostWeights(priority))
	if !found {
		t.Fatalf("%s: no route found", priority)
	}
	if !reflect.DeepEqual(routeSequence(path), expectedRouteIDs) {
		t.Fatalf("%s: route = %v, want %v", priority, routeSequence(path), expectedRouteIDs)
	}
}

// Con transbordo: 300 + 600 + 300 + 400 = 1600 s reales.
// Directa: 300 + 1350 = 1650 s reales.
// balanced cobra la espera doble y el transbordo, así que prefiere la directa.
func TestFastestPriorityAcceptsTransferToArriveSooner(t *testing.T) {
	graph := twoRouteGraph([]string{"ORIGIN", "MIDDLE", "DESTINATION"}, map[string][]Edge{
		"ORIGIN": {
			{ToStopID: "MIDDLE", RouteID: "L1", BaseTimeSec: 600},
			{ToStopID: "DESTINATION", RouteID: "L3", BaseTimeSec: 1350},
		},
		"MIDDLE": {{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 400}},
	})
	assertPriorityRoute(t, graph, priorityBalanced, []string{"L3"})
	assertPriorityRoute(t, graph, priorityFastest, []string{"L1", "L2"})
}

// Con transbordo: balanced cobra 600 + 600 + 600 + 600 + 300 = 2700.
// Directa: 600 + 3000 = 3600. Con fewest_transfers, el transbordo cuesta 1800
// y la ruta con transbordo sube a 4200.
func TestFewestTransfersPriorityAvoidsLineChange(t *testing.T) {
	graph := twoRouteGraph([]string{"ORIGIN", "MIDDLE", "DESTINATION"}, map[string][]Edge{
		"ORIGIN": {
			{ToStopID: "MIDDLE", RouteID: "L1", BaseTimeSec: 600},
			{ToStopID: "DESTINATION", RouteID: "L3", BaseTimeSec: 3000},
		},
		"MIDDLE": {{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 600}},
	})
	assertPriorityRoute(t, graph, priorityBalanced, []string{"L1", "L2"})
	assertPriorityRoute(t, graph, priorityFewestTransfers, []string{"L3"})
}

// Caminando primero: balanced cobra 300 × 2 + 600 + 600 = 1800.
// Directa: 600 + 1600 = 2200. Con least_walking, la caminata pesa 5 y la ruta
// caminando sube a 300 × 5 + 600 + 600 = 2700.
func TestLeastWalkingPriorityAvoidsWalking(t *testing.T) {
	graph := twoRouteGraph([]string{"ORIGIN", "MIDDLE", "DESTINATION"}, map[string][]Edge{
		"ORIGIN": {
			{ToStopID: "MIDDLE", RouteID: walkRouteID, BaseTimeSec: 300},
			{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 1600},
		},
		"MIDDLE": {{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 600}},
	})
	assertPriorityRoute(t, graph, priorityBalanced, []string{walkRouteID, "L1"})
	assertPriorityRoute(t, graph, priorityLeastWalking, []string{"L2"})
}

// pathWalkSeconds suma el tiempo caminando de una ruta.
func pathWalkSeconds(path []pathStep) int {
	walkSeconds := 0
	for _, step := range path {
		if step.Edge.RouteID == walkRouteID {
			walkSeconds += step.Edge.BaseTimeSec
		}
	}
	return walkSeconds
}

// Si dos pesos solo difieren en la caminata, la ruta óptima con la caminata más
// pesada nunca camina más. Lo mismo ocurre con los transbordos. Se revisa en
// todos los pares de paraderos de la red oficial.
func TestPrioritiesNeverWorsenTheirGoalOnOfficialNetwork(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	balancedWeights := priorityCostWeights(priorityBalanced)
	for _, stopPair := range allStopPairs(graph) {
		balancedPath, found := cheapestPath(graph, stopPair[0], stopPair[1], balancedWeights)
		if !found {
			continue
		}
		leastWalkingPath, _ := cheapestPath(graph, stopPair[0], stopPair[1], priorityCostWeights(priorityLeastWalking))
		if pathWalkSeconds(leastWalkingPath) > pathWalkSeconds(balancedPath) {
			t.Errorf("%s -> %s: least_walking walks %d s, balanced %d s",
				stopPair[0], stopPair[1], pathWalkSeconds(leastWalkingPath), pathWalkSeconds(balancedPath))
		}
		fewestTransfersPath, _ := cheapestPath(graph, stopPair[0], stopPair[1], priorityCostWeights(priorityFewestTransfers))
		if countTransfers(fewestTransfersPath) > countTransfers(balancedPath) {
			t.Errorf("%s -> %s: fewest_transfers has %d transfers, balanced %d",
				stopPair[0], stopPair[1], countTransfers(fewestTransfersPath), countTransfers(balancedPath))
		}
	}
}
